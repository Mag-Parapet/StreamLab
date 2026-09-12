use crate::{
    AppState,
    error::{ApiError, ApiResult},
};
use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
pub struct DestinationRow {
    pub id: Uuid,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub url: String,
    pub encrypted_key: Option<String>,
    pub title: String,
    pub description: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Destination {
    pub id: Uuid,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub url: String,
    pub key_configured: bool,
    pub title: String,
    pub description: String,
    pub status: String,
}
impl DestinationRow {
    pub fn public(&self) -> Destination {
        Destination {
            id: self.id,
            name: self.name.clone(),
            kind: self.kind.clone(),
            enabled: self.enabled,
            url: self.url.clone(),
            key_configured: self.encrypted_key.is_some(),
            title: self.title.clone(),
            description: self.description.clone(),
            status: if self.enabled { "idle" } else { "disabled" }.into(),
        }
    }
}
pub trait StreamingDestination {
    fn validate_host(&self, host: &str) -> bool;
}
pub struct YouTubeDestination;
pub struct FacebookDestination;
pub struct CustomDestination;
impl StreamingDestination for YouTubeDestination {
    fn validate_host(&self, host: &str) -> bool {
        host.ends_with(".youtube.com") || host.ends_with(".youtube-nocookie.com")
    }
}
impl StreamingDestination for FacebookDestination {
    fn validate_host(&self, host: &str) -> bool {
        host.ends_with(".facebook.com") || host.ends_with(".fbcdn.net")
    }
}
impl StreamingDestination for CustomDestination {
    fn validate_host(&self, _: &str) -> bool {
        true
    }
}
pub fn forward_url(kind: &str, base: &str, key: &str) -> ApiResult<String> {
    let mut url =
        url::Url::parse(base).map_err(|_| ApiError::bad("Enter a valid RTMP(S) server URL"))?;
    if !["rtmp", "rtmps"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(ApiError::bad(
            "Server URL must use RTMP(S), with no credentials, query or stream key",
        ));
    }
    let adapter: Box<dyn StreamingDestination> = match kind {
        "youtube" => Box::new(YouTubeDestination),
        "facebook" => Box::new(FacebookDestination),
        "custom" => Box::new(CustomDestination),
        _ => return Err(ApiError::bad("Unsupported destination type")),
    };
    if !adapter.validate_host(url.host_str().unwrap_or_default()) {
        return Err(ApiError::bad(
            "Server hostname does not match the selected platform",
        ));
    }
    if key.len() > 2048 || key.chars().any(char::is_control) {
        return Err(ApiError::bad("Invalid stream key"));
    }
    url.set_fragment(Some(key));
    Ok(url.to_string())
}
pub async fn rows(state: &AppState) -> ApiResult<Vec<DestinationRow>> {
    Ok(sqlx::query_as::<_,DestinationRow>("SELECT id,name,kind,enabled,url,encrypted_key,title,description FROM destinations ORDER BY created_at,id").fetch_all(&state.db).await?)
}
pub async fn list(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let rows = rows(&state).await?;
    let snapshot = state.snapshot.read().await;
    let items: Vec<_> = rows
        .iter()
        .map(|row| {
            let mut d = row.public();
            if let Some(current) = snapshot.stream.destinations.iter().find(|d| d.id == row.id) {
                d.status = current.status.clone();
            }
            d
        })
        .collect();
    Ok(Json(json!({"data":items})))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DestinationInput {
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub url: String,
    pub stream_key: Option<String>,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub clear_key: bool,
}
fn validate(input: &DestinationInput) -> ApiResult<()> {
    if input.name.trim().is_empty()
        || input.name.len() > 100
        || input.title.len() > 200
        || input.description.len() > 5000
        || input.url.len() > 1000
    {
        return Err(ApiError::bad("Check destination field lengths"));
    }
    forward_url(
        &input.kind,
        &input.url,
        input.stream_key.as_deref().unwrap_or(""),
    )?;
    Ok(())
}
async fn save(
    state: AppState,
    id: Uuid,
    input: DestinationInput,
    create: bool,
) -> ApiResult<Json<Value>> {
    validate(&input)?;
    let _lock = state.control.lock().await;
    if state
        .relay_enabled
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Err(ApiError::bad("Stop the relay before changing destinations"));
    }
    let mut tx = state.db.begin().await?;
    if create {
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM destinations")
            .fetch_one(&mut *tx)
            .await?;
        if count >= 20 {
            return Err(ApiError::bad("Maximum of 20 destinations reached"));
        }
        sqlx::query("INSERT INTO destinations(id,name,kind,url) VALUES($1,$2,$3,$4)")
            .bind(id)
            .bind(&input.name)
            .bind(&input.kind)
            .bind(&input.url)
            .execute(&mut *tx)
            .await?;
    }
    let old: Option<(Option<String>,)> =
        sqlx::query_as("SELECT encrypted_key FROM destinations WHERE id=$1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (old_key,) = old.ok_or_else(|| {
        ApiError(
            axum::http::StatusCode::NOT_FOUND,
            "Destination not found".into(),
        )
    })?;
    let key = if input.clear_key {
        None
    } else if let Some(s) = input.stream_key.filter(|v| !v.is_empty()) {
        Some(crate::crypto::encrypt(&state.config.encryption_key, &s)?)
    } else {
        old_key
    };
    if input.enabled && key.is_none() {
        return Err(ApiError::bad(
            "Configure a stream key before enabling this destination",
        ));
    }
    sqlx::query("UPDATE destinations SET name=$2,kind=$3,enabled=$4,url=$5,encrypted_key=$6,title=$7,description=$8 WHERE id=$1")
 .bind(id).bind(input.name).bind(input.kind).bind(input.enabled).bind(input.url).bind(key).bind(input.title).bind(input.description).execute(&mut *tx).await?;
    tx.commit().await?;
    crate::logs::record(
        &state,
        "info",
        "destinations",
        "Destination configuration saved",
    )
    .await;
    Ok(Json(json!({"data":{"id":id}})))
}
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<DestinationInput>,
) -> ApiResult<Json<Value>> {
    save(state, Uuid::new_v4(), input, true).await
}
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<DestinationInput>,
) -> ApiResult<Json<Value>> {
    save(state, id, input, false).await
}
pub async fn delete(State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<Json<Value>> {
    let _lock = state.control.lock().await;
    if state
        .relay_enabled
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Err(ApiError::bad("Stop the relay before deleting destinations"));
    }
    let result = sqlx::query("DELETE FROM destinations WHERE id=$1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError(
            axum::http::StatusCode::NOT_FOUND,
            "Destination not found".into(),
        ));
    }
    crate::logs::record(&state, "info", "destinations", "Destination removed").await;
    Ok(Json(json!({"data":{"ok":true}})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reject_embedded_secrets_and_platform_mismatch() {
        assert!(forward_url("youtube", "rtmps://evil.com/live", "key").is_err());
        assert!(forward_url("custom", "http://localhost", "key").is_err());
        assert!(forward_url("custom", "rtmp://host/live#secret", "key").is_err());
        assert!(forward_url("custom", "rtmp://user:pass@host/live", "key").is_err());
        assert!(
            forward_url("youtube", "rtmps://a.rtmp.youtube.com/live2", "key")
                .unwrap()
                .ends_with("#key")
        );
    }
    #[test]
    fn public_dto_omits_secret() {
        let row = DestinationRow {
            id: Uuid::new_v4(),
            name: "YouTube".into(),
            kind: "youtube".into(),
            enabled: false,
            url: "rtmps://a.rtmp.youtube.com/live2".into(),
            encrypted_key: Some("TOP_SECRET".into()),
            title: "".into(),
            description: "".into(),
        };
        let json = serde_json::to_string(&row.public()).unwrap();
        assert!(!json.contains("TOP_SECRET"));
        assert!(!json.contains("encrypted_key"));
        assert!(!json.contains("stream_key"));
    }
}
