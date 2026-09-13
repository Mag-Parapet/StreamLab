use crate::{
    AppState,
    error::{ApiError, ApiResult},
};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::Response,
};
use chrono::{Duration, Utc};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    Argon2::default()
        .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|v| v.to_string())
        .map_err(|_| anyhow::anyhow!("Password hashing failed"))
}
fn verify(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).ok().is_some_and(|h| {
        Argon2::default()
            .verify_password(password.as_bytes(), &h)
            .is_ok()
    })
}
fn token_hash(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    let token = cookie
        .split(';')
        .find_map(|part| part.trim().strip_prefix("scc_session="))?;
    Some(hex::encode(Sha256::digest(token.as_bytes())))
}
pub async fn session(state: &AppState, headers: &HeaderMap) -> ApiResult<(Uuid, String)> {
    let hash = token_hash(headers).ok_or_else(ApiError::unauthorized)?;
    sqlx::query_as::<_,(Uuid,String)>("SELECT u.id,u.username FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()")
 .bind(hash).fetch_optional(&state.db).await?.ok_or_else(ApiError::unauthorized)
}
pub async fn protect(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> ApiResult<Response> {
    session(&state, request.headers()).await?;
    Ok(next.run(request).await)
}
// Same-origin mutations plus a non-simple custom header protect cookie sessions from CSRF.
pub async fn csrf(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> ApiResult<Response> {
    if !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) {
        if request
            .headers()
            .get("x-requested-with")
            .and_then(|x| x.to_str().ok())
            != Some("stream-control")
        {
            return Err(ApiError(
                StatusCode::FORBIDDEN,
                "Missing request protection header".into(),
            ));
        }
        if let Some(origin) = request.headers().get(header::ORIGIN)
            && !origin.to_str().ok().is_some_and(|value| {
                state
                    .config
                    .allowed_origins
                    .iter()
                    .any(|allowed| allowed == value)
            })
        {
            return Err(ApiError(
                StatusCode::FORBIDDEN,
                "Origin is not allowed".into(),
            ));
        }
    }
    Ok(next.run(request).await)
}
#[derive(Deserialize)]
pub struct Login {
    username: String,
    password: String,
}
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<Login>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    if input.username.len() > 100 || input.password.len() > 1024 {
        return Err(ApiError::bad("Invalid login"));
    }
    // Global limiter is deliberately independent of spoofable forwarding headers.
    {
        let mut attempts = state.login_attempts.lock().await;
        attempts.retain(|v| v.elapsed().as_secs() < 60);
        if attempts.len() >= 10 {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Too many attempts. Wait one minute.".into(),
            ));
        }
        attempts.push(std::time::Instant::now());
    }
    let row =
        sqlx::query_as::<_, (Uuid, String)>("SELECT id,password_hash FROM users WHERE username=$1")
            .bind(&input.username)
            .fetch_optional(&state.db)
            .await?;
    let check_hash = row
        .as_ref()
        .map(|r| r.1.clone())
        .unwrap_or_else(|| state.dummy_hash.to_string());
    let valid = tokio::task::spawn_blocking(move || verify(&input.password, &check_hash))
        .await
        .unwrap_or(false);
    if !valid || row.is_none() {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "Incorrect username or password".into(),
        ));
    }
    let (id, verified_hash) = row.unwrap();
    // Serialize token creation with password changes. A login verified against
    // an old hash must not create a session after password-change revocation.
    let mut tx = state.db.begin().await?;
    let current_hash: String =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE id=$1 FOR UPDATE")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    if current_hash != verified_hash {
        return Err(ApiError::unauthorized());
    }
    let mut bytes = [0; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    let hours = state.settings.read().await.session_hours;
    sqlx::query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)")
        .bind(hex::encode(Sha256::digest(token.as_bytes())))
        .bind(id)
        .bind(Utc::now() + Duration::hours(hours))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        cookie(&state, &token, hours * 3600).parse().unwrap(),
    );
    Ok((headers, Json(json!({"data":{"username":input.username}}))))
}
fn cookie(state: &AppState, token: &str, max_age: i64) -> String {
    format!(
        "scc_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{}",
        if state.config.secure_cookie {
            "; Secure"
        } else {
            ""
        }
    )
}
pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let (_, username) = session(&state, &headers).await?;
    Ok(Json(json!({"data":{"username":username}})))
}
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    if let Some(hash) = token_hash(&headers) {
        sqlx::query("DELETE FROM auth_sessions WHERE token_hash=$1")
            .bind(hash)
            .execute(&state.db)
            .await?;
    }
    let mut out = HeaderMap::new();
    out.insert(header::SET_COOKIE, cookie(&state, "", 0).parse().unwrap());
    Ok((out, Json(json!({"data":{"ok":true}}))))
}
#[derive(Deserialize)]
pub struct PasswordChange {
    current_password: String,
    new_password: String,
}
pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PasswordChange>,
) -> ApiResult<Json<Value>> {
    if input.new_password.len() < 12
        || input.new_password.len() > 1024
        || input.current_password.len() > 1024
    {
        return Err(ApiError::bad(
            "Use a password between 12 and 1024 characters",
        ));
    }
    let (id, _) = session(&state, &headers).await?;
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id=$1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let verified_hash = hash.clone();
    let next = tokio::task::spawn_blocking(move || {
        if !verify(&input.current_password, &hash) {
            return None;
        }
        hash_password(&input.new_password).ok()
    })
    .await
    .ok()
    .flatten()
    .ok_or_else(|| ApiError::bad("Current password is incorrect"))?;
    let mut tx = state.db.begin().await?;
    let updated = sqlx::query("UPDATE users SET password_hash=$1 WHERE id=$2 AND password_hash=$3")
        .bind(next)
        .bind(id)
        .bind(verified_hash)
        .execute(&mut *tx)
        .await?;
    if updated.rows_affected() != 1 {
        return Err(ApiError::unauthorized());
    }
    sqlx::query("DELETE FROM auth_sessions WHERE user_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"data":{"ok":true}})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_validation() {
        let hash = hash_password("a long test password").unwrap();
        assert!(verify("a long test password", &hash));
        assert!(!verify("wrong", &hash));
    }
}
