use crate::{
    AppState,
    error::{ApiError, ApiResult},
};
use async_trait::async_trait;
use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct StreamStatus {
    pub engine_online: bool,
    pub obs_connected: bool,
    pub started_at: Option<DateTime<Utc>>,
    pub uptime_seconds: i64,
    pub bitrate_mbps: Option<f64>,
    pub resolution: Option<String>,
    pub fps: Option<f64>,
    pub codec: Option<String>,
    pub viewers: Option<usize>,
    pub relay_enabled: bool,
    pub destinations: Vec<crate::destinations::Destination>,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EnginePath {
    #[serde(default)]
    pub online: bool,
    #[serde(default)]
    pub online_time: Option<DateTime<Utc>>,
    #[serde(default)]
    pub inbound_bytes: u64,
    #[serde(default)]
    pub readers: Vec<Value>,
    #[serde(default)]
    pub tracks2: Vec<Value>,
}
#[derive(Deserialize)]
pub struct ForwardStatus {
    pub pos: usize,
    pub state: String,
}
#[async_trait]
pub trait MediaEngine: Send + Sync {
    async fn path(&self) -> ApiResult<EnginePath>;
    async fn forwards(&self) -> ApiResult<Vec<ForwardStatus>>;
    async fn configure(&self, forwards: Vec<Value>) -> ApiResult<()>;
}
pub struct MediaMtxEngine {
    pub client: reqwest::Client,
    pub base: String,
    pub user: String,
    pub password: String,
}
impl MediaMtxEngine {
    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.client
            .request(
                method,
                format!("{}{}", self.base.trim_end_matches('/'), path),
            )
            .basic_auth(&self.user, Some(&self.password))
    }
}
#[async_trait]
impl MediaEngine for MediaMtxEngine {
    async fn path(&self) -> ApiResult<EnginePath> {
        let response = self
            .request(reqwest::Method::GET, "/v3/paths/get/live")
            .send()
            .await
            .map_err(|_| ApiError::upstream())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(EnginePath::default());
        }
        response
            .error_for_status()
            .map_err(|_| ApiError::upstream())?
            .json()
            .await
            .map_err(|_| ApiError::upstream())
    }
    async fn forwards(&self) -> ApiResult<Vec<ForwardStatus>> {
        #[derive(Deserialize)]
        struct List {
            items: Vec<ForwardStatus>,
        }
        let response = self
            .request(
                reqwest::Method::GET,
                "/v3/paths/forward-dests/list?path=live&itemsPerPage=100",
            )
            .send()
            .await
            .map_err(|_| ApiError::upstream())?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(vec![]);
        }
        Ok(response
            .error_for_status()
            .map_err(|_| ApiError::upstream())?
            .json::<List>()
            .await
            .map_err(|_| ApiError::upstream())?
            .items)
    }
    async fn configure(&self, forwards: Vec<Value>) -> ApiResult<()> {
        self.request(reqwest::Method::PATCH, "/v3/config/paths/patch/live")
            .json(&json!({"forward":forwards}))
            .send()
            .await
            .map_err(|_| ApiError::upstream())?
            .error_for_status()
            .map_err(|_| ApiError::upstream())?;
        Ok(())
    }
}
pub async fn apply(state: &AppState, enabled: bool) -> ApiResult<()> {
    let rows = crate::destinations::rows(state).await?;
    let mut forwards = vec![];
    let mut ids = vec![];
    if enabled {
        for row in rows.iter().filter(|r| r.enabled) {
            let secret = row
                .encrypted_key
                .as_ref()
                .ok_or_else(|| ApiError::bad("Every enabled destination needs a stream key"))?;
            let key = crate::crypto::decrypt(&state.config.encryption_key, secret)?;
            forwards
                .push(json!({"dest":crate::destinations::forward_url(&row.kind,&row.url,&key)?}));
            ids.push(row.id);
        }
        if forwards.is_empty() {
            return Err(ApiError::bad(
                "Enable and configure at least one destination",
            ));
        }
    }
    state.engine.configure(forwards).await?;
    *state.active_destinations.write().await = ids;
    state
        .relay_enabled
        .store(enabled, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}
pub async fn start(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let _lock = state.control.lock().await;
    apply(&state, true).await?;
    crate::logs::record(
        &state,
        "info",
        "destinations",
        "Relay enabled; waiting for forwarding confirmation",
    )
    .await;
    Ok(Json(json!({"data":{"ok":true}})))
}
pub async fn stop(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let _lock = state.control.lock().await;
    apply(&state, false).await?;
    crate::logs::record(&state, "info", "destinations", "Relay stopped").await;
    Ok(Json(json!({"data":{"ok":true}})))
}
pub async fn restart(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let _lock = state.control.lock().await;
    apply(&state, false).await?;
    apply(&state, true).await?;
    crate::logs::record(&state, "info", "destinations", "Relay restarted").await;
    Ok(Json(json!({"data":{"ok":true}})))
}
pub async fn status(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"data":state.snapshot.read().await.stream}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_current_path_with_deprecated_fields_present() {
        let path: EnginePath = serde_json::from_value(json!({
            "online":true,"ready":true,"available":true,
            "onlineTime":"2026-09-09T12:00:00Z","readyTime":"2026-09-09T12:00:00Z",
            "inboundBytes":1024,"tracks2":[],"readers":[]
        }))
        .unwrap();
        assert!(path.online);
        assert_eq!(path.inbound_bytes, 1024);
    }
    #[tokio::test]
    async fn mediamtx_http_contract() {
        use axum::routing::{get, patch};
        let router=axum::Router::new().route("/v3/paths/get/live",get(||async{Json(json!({"online":true,"onlineTime":"2026-09-09T12:00:00Z","inboundBytes":1024,"tracks2":[{"codec":"H264","codecProps":{"width":1920,"height":1080}}],"readers":[]}))}))
  .route("/v3/config/paths/patch/live",patch(|Json(body):Json<Value>|async move{assert!(body["forward"].is_array());Json(json!({"status":"ok"}))}));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let engine = MediaMtxEngine {
            client: reqwest::Client::new(),
            base: format!("http://{addr}"),
            user: "control".into(),
            password: "test".into(),
        };
        assert!(engine.path().await.unwrap().online);
        engine.configure(vec![]).await.unwrap();
        task.abort();
    }
}
