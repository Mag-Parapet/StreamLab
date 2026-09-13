use crate::{
    AppState,
    error::{ApiError, ApiResult},
    monitoring::{Monitor, ServerStats},
    storage::Storage,
    streaming::StreamStatus,
};
use axum::{
    Json,
    extract::{
        State,
        ws::{Message, WebSocketUpgrade},
    },
    http::HeaderMap,
    response::Response,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Snapshot {
    pub timestamp: Option<DateTime<Utc>>,
    pub stream: StreamStatus,
    pub server: ServerStats,
    pub storage: Storage,
}
pub async fn get(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"data":*state.snapshot.read().await}))
}
pub async fn sessions(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let rows:Vec<(Value,)>=sqlx::query_as("SELECT to_jsonb(s) FROM (SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT 100) s").fetch_all(&state.db).await?;
    Ok(Json(
        json!({"data":rows.into_iter().map(|r|r.0).collect::<Vec<_>>()}),
    ))
}
pub async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> ApiResult<Response> {
    if !headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|value| {
            state
                .config
                .allowed_origins
                .iter()
                .any(|allowed| allowed == value)
        })
    {
        return Err(ApiError(
            axum::http::StatusCode::FORBIDDEN,
            "WebSocket origin is not allowed".into(),
        ));
    }
    Ok(ws.max_message_size(1024).max_frame_size(1024).on_upgrade(move|mut socket|async move{
  let mut events=state.events.subscribe();let mut interval=tokio::time::interval(std::time::Duration::from_secs(30));
  let first=json!({"type":"snapshot","data":*state.snapshot.read().await}).to_string();
  if socket.send(Message::Text(first.into())).await.is_err(){return;}
  loop{tokio::select!{
   event=events.recv()=>{match event{Ok(event)=>{if event=="shutdown" {let _=socket.send(Message::Close(None)).await;break;}
if socket.send(Message::Text(event.into())).await.is_err(){break;}},Err(tokio::sync::broadcast::error::RecvError::Lagged(_))=>{let message=json!({"type":"snapshot","data":*state.snapshot.read().await}).to_string();if socket.send(Message::Text(message.into())).await.is_err(){break;}},Err(_)=>break}},
   incoming=socket.recv()=>{match incoming{None|Some(Err(_))|Some(Ok(Message::Close(_)))=>break,_=>{}}},
   _=interval.tick()=>{if crate::auth::session(&state,&headers).await.is_err(){let _=socket.send(Message::Close(None)).await;break;}
if socket.send(Message::Ping(vec![].into())).await.is_err(){break;}}
  }}
 }))
}
pub async fn run(state: AppState) {
    let mut monitor = Monitor::default();
    let mut previous_bytes: Option<(u64, std::time::Instant)> = None;
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut previous = Snapshot::default();
    let mut session_id = None;
    let mut ticks = 0u64;
    loop {
        interval.tick().await;
        ticks += 1;
        let sample = state.engine.path().await;
        let mut stream = StreamStatus {
            engine_online: sample.is_ok(),
            relay_enabled: state
                .relay_enabled
                .load(std::sync::atomic::Ordering::SeqCst),
            ..Default::default()
        };
        if let Ok(path) = sample {
            stream.obs_connected = path.online;
            stream.started_at = path.online_time;
            stream.uptime_seconds = path
                .online_time
                .map(|v| (Utc::now() - v).num_seconds().max(0))
                .unwrap_or(0);
            if path.online {
                let now = std::time::Instant::now();
                if let Some((bytes, time)) = previous_bytes
                    && path.inbound_bytes >= bytes
                    && stream.started_at == previous.stream.started_at
                {
                    stream.bitrate_mbps = Some(
                        (path.inbound_bytes - bytes) as f64 * 8.0
                            / time.elapsed().as_secs_f64()
                            / 1e6,
                    );
                }
                previous_bytes = Some((path.inbound_bytes, now));
                stream.viewers = Some(path.readers.len());
                stream.codec = path
                    .tracks2
                    .iter()
                    .filter_map(|v| v["codec"].as_str())
                    .next()
                    .map(str::to_owned);
                stream.resolution = path.tracks2.iter().find_map(|v| {
                    let p = &v["codecProps"];
                    Some(format!(
                        "{} × {}",
                        p["width"].as_u64()?,
                        p["height"].as_u64()?
                    ))
                });
            } else {
                previous_bytes = None;
            }
        } else {
            previous_bytes = None;
        }
        // Serialize telemetry mapping with configuration changes so positions cannot map to the wrong destination.
        {
            let _lock = state.control.lock().await;
            stream.relay_enabled = state
                .relay_enabled
                .load(std::sync::atomic::Ordering::SeqCst);
            if let Ok(rows) = crate::destinations::rows(&state).await {
                let forwards = if stream.engine_online {
                    state.engine.forwards().await.ok()
                } else {
                    None
                };
                let active = state.active_destinations.read().await.clone();
                stream.destinations = rows
                    .iter()
                    .map(|row| {
                        let mut d = row.public();
                        if d.enabled && stream.relay_enabled {
                            d.status = if !stream.engine_online || forwards.is_none() {
                                "unknown".into()
                            } else if !stream.obs_connected {
                                "waiting".into()
                            } else {
                                active
                                    .iter()
                                    .position(|id| *id == row.id)
                                    .and_then(|pos| {
                                        // MediaMTX reports positions starting at one.
                                        forwards.as_ref()?.iter().find(|f| f.pos == pos + 1)
                                    })
                                    .map(|f| f.state.clone())
                                    .unwrap_or("pending".into())
                            };
                        }
                        d
                    })
                    .collect();
                if stream.relay_enabled
                    && stream.obs_connected
                    && forwards.as_ref().is_some_and(Vec::is_empty)
                    && ticks.is_multiple_of(5)
                    && crate::streaming::apply(&state, true).await.is_err()
                {
                    crate::logs::record(
                        &state,
                        "warning",
                        "mediamtx",
                        "Could not restore relay configuration",
                    )
                    .await;
                }
            }
        }
        if stream.engine_online != previous.stream.engine_online {
            crate::logs::record(
                &state,
                if stream.engine_online {
                    "info"
                } else {
                    "error"
                },
                "mediamtx",
                if stream.engine_online {
                    "MediaMTX API connected"
                } else {
                    "MediaMTX API unavailable; stream state cannot be confirmed"
                },
            )
            .await;
        }
        if stream.engine_online && stream.obs_connected != previous.stream.obs_connected {
            crate::logs::record(
                &state,
                if stream.obs_connected {
                    "info"
                } else {
                    "warning"
                },
                "mediamtx",
                if stream.obs_connected {
                    "OBS publisher connected"
                } else {
                    "OBS publisher disconnected"
                },
            )
            .await;
        }
        for d in &stream.destinations {
            if previous
                .stream
                .destinations
                .iter()
                .find(|v| v.id == d.id)
                .is_some_and(|old| old.status != d.status)
            {
                crate::logs::record(&state,if d.status=="error"{"error"}else{"info"},"destinations",match d.status.as_str(){"forwarding"=>"A destination is forwarding","error"=>"A destination reported a forwarding error; verify endpoint, key and stream format",_=>"Destination forwarding state changed"}).await;
            }
        }
        if stream.engine_online && stream.obs_connected && session_id.is_none() {
            let id = uuid::Uuid::new_v4();
            if sqlx::query("INSERT INTO stream_sessions(id,start_time,status) VALUES($1,$2,'live')")
                .bind(id)
                .bind(stream.started_at.unwrap_or_else(Utc::now))
                .execute(&state.db)
                .await
                .is_ok()
            {
                session_id = Some(id);
            }
        }
        if let Some(id) = session_id {
            let ended = stream.engine_online && !stream.obs_connected;
            let ids: Vec<_> = stream
                .destinations
                .iter()
                .filter(|d| d.status == "forwarding")
                .map(|d| d.id)
                .collect();
            let result=sqlx::query("UPDATE stream_sessions SET input_bitrate=COALESCE($2,input_bitrate),resolution=COALESCE($3,resolution),fps=COALESCE($4,fps),destinations=CASE WHEN $5 THEN destinations ELSE $6 END,end_time=CASE WHEN $5 THEN now() ELSE NULL END,duration=EXTRACT(EPOCH FROM now()-start_time)::bigint,status=CASE WHEN $5 THEN 'ended' ELSE 'live' END WHERE id=$1")
   .bind(id).bind(stream.bitrate_mbps).bind(&stream.resolution).bind(stream.fps).bind(ended).bind(json!(ids)).execute(&state.db).await;
            if ended && result.is_ok() {
                session_id = None;
            }
        }
        let snapshot = Snapshot {
            timestamp: Some(Utc::now()),
            stream,
            server: monitor.sample(&state.config),
            storage: crate::storage::sample(&state.config),
        };
        *state.snapshot.write().await = snapshot.clone();
        let _ = state
            .events
            .send(json!({"type":"snapshot","data":snapshot}).to_string());
        previous = snapshot;
        if ticks.is_multiple_of(1800) {
            let _ = sqlx::query("DELETE FROM auth_sessions WHERE expires_at<now()")
                .execute(&state.db)
                .await;
            let _ = sqlx::query(
                "DELETE FROM system_events WHERE timestamp < now() - interval '30 days'",
            )
            .execute(&state.db)
            .await;
        }
    }
}
