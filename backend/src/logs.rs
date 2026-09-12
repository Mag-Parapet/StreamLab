use crate::{AppState, error::ApiResult};
use axum::{
    Json,
    extract::{Query, State},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Event {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub level: String,
    pub source: String,
    pub message: String,
}
// Only curated messages enter this store. Never persist upstream errors/URLs or request bodies.
pub async fn record(state: &AppState, level: &str, source: &str, message: &str) {
    match sqlx::query_as::<_,Event>("INSERT INTO system_events(level,source,message) VALUES($1,$2,$3) RETURNING id,timestamp,level,source,message").bind(level).bind(source).bind(message).fetch_one(&state.db).await{
  Ok(event)=>{let _=state.events.send(json!({"type":"log","data":event}).to_string());},Err(_)=>tracing::error!("Could not persist system event")
 }
}
#[derive(Deserialize)]
pub struct Filters {
    pub level: Option<String>,
    pub source: Option<String>,
    pub before: Option<i64>,
}
pub async fn list(
    State(state): State<AppState>,
    Query(filter): Query<Filters>,
) -> ApiResult<Json<Value>> {
    let items=sqlx::query_as::<_,Event>("SELECT id,timestamp,level,source,message FROM system_events WHERE ($1::text IS NULL OR level=$1) AND ($2::text IS NULL OR source=$2) AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 200")
 .bind(filter.level).bind(filter.source).bind(filter.before).fetch_all(&state.db).await?;
    Ok(Json(json!({"data":items})))
}
