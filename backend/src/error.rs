use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);
impl ApiError {
    pub fn bad(message: &str) -> Self {
        Self(StatusCode::BAD_REQUEST, message.into())
    }
    pub fn unauthorized() -> Self {
        Self(StatusCode::UNAUTHORIZED, "Please sign in again".into())
    }
    pub fn upstream() -> Self {
        Self(StatusCode::BAD_GATEWAY, "MediaMTX is unavailable or rejected the configuration. Check its address and credentials.".into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": {"message": self.1}}))).into_response()
    }
}
impl From<sqlx::Error> for ApiError {
    fn from(_: sqlx::Error) -> Self {
        tracing::error!("Database operation failed");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database operation failed".into(),
        )
    }
}
pub type ApiResult<T> = Result<T, ApiError>;

pub async fn normalize(request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let mut response = next.run(request).await;
    let status = response.status();
    if (status.is_client_error() || status.is_server_error())
        && response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            != Some("application/json")
    {
        response = ApiError(
            status,
            match status {
                StatusCode::UNPROCESSABLE_ENTITY | StatusCode::BAD_REQUEST => {
                    "Invalid request fields or JSON body"
                }
                StatusCode::PAYLOAD_TOO_LARGE => "Request body exceeds the 32 KB limit",
                StatusCode::UNSUPPORTED_MEDIA_TYPE => "Use Content-Type: application/json",
                _ => "Request could not be processed",
            }
            .into(),
        )
        .into_response();
    }
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
}
