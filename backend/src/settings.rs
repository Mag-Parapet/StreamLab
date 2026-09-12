use crate::{
    AppState,
    error::{ApiError, ApiResult},
};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub server_name: String,
    pub input_protocol: String,
    pub input_port: u16,
    pub default_bitrate: u32,
    pub default_resolution: String,
    pub default_fps: u16,
    pub file_browser_url: String,
    pub session_hours: i64,
}
pub async fn get(State(state): State<AppState>) -> Json<Value> {
    Json(
        json!({"data":{"preferences":*state.settings.read().await,"infrastructure":{"mediamtx_api_url":state.config.mediamtx_api,"mediamtx_rtsp_url":state.config.mediamtx_rtsp,"managed_by":"environment","api_auth":"HttpOnly session cookie + X-Requested-With: stream-control","recordings_enabled":false}}}),
    )
}
pub async fn update(
    State(state): State<AppState>,
    Json(input): Json<Settings>,
) -> ApiResult<Json<Value>> {
    let url = url::Url::parse(&input.file_browser_url)
        .map_err(|_| ApiError::bad("Invalid File Browser URL"))?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(ApiError::bad(
            "File Browser must use an HTTP(S) URL without credentials",
        ));
    }
    if input.server_name.trim().is_empty()
        || input.server_name.len() > 80
        || !(1..=168).contains(&input.session_hours)
        || !(100..=100000).contains(&input.default_bitrate)
        || !(1..=120).contains(&input.default_fps)
        || input.default_resolution.len() > 32
    {
        return Err(ApiError::bad("Check the settings values"));
    }
    if input.input_protocol != "rtmp" || input.input_port != 1935 {
        return Err(ApiError::bad(
            "Input protocol and port are managed in Docker Compose; this deployment uses RTMP on port 1935",
        ));
    }
    sqlx::query("UPDATE settings SET value=$1 WHERE id=true")
        .bind(json!(input))
        .execute(&state.db)
        .await?;
    *state.settings.write().await = input;
    crate::logs::record(&state, "info", "application", "Dashboard settings updated").await;
    Ok(get(State(state)).await)
}
