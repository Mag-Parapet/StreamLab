mod auth;
mod config;
mod crypto;
mod dashboard;
mod destinations;
mod error;
mod logs;
mod monitoring;
mod settings;
mod storage;
mod streaming;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    middleware,
    routing::{get, post, put},
};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use std::sync::{Arc, atomic::AtomicBool};
use streaming::MediaEngine;
use tokio::sync::{Mutex, RwLock, broadcast};
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Arc<config::Config>,
    pub engine: Arc<dyn MediaEngine>,
    pub settings: Arc<RwLock<settings::Settings>>,
    pub snapshot: Arc<RwLock<dashboard::Snapshot>>,
    pub events: broadcast::Sender<String>,
    pub relay_enabled: Arc<AtomicBool>,
    pub active_destinations: Arc<RwLock<Vec<uuid::Uuid>>>,
    pub control: Arc<Mutex<()>>,
    pub login_attempts: Arc<Mutex<Vec<std::time::Instant>>>,
    pub dummy_hash: Arc<String>,
}
async fn health(State(state): State<AppState>) -> Result<Json<Value>, error::ApiError> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({"data":{"status":"ok"}})))
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new("stream_control=info"))
        .init();
    let config = Arc::new(config::Config::load()?);
    let db = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    let hash = auth::hash_password(&config.admin_password)?;
    sqlx::query("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING").bind(uuid::Uuid::new_v4()).bind(&config.admin_user).bind(hash).execute(&db).await?;
    let defaults = settings::Settings {
        server_name: "Streaming server".into(),
        input_protocol: "rtmp".into(),
        input_port: 1935,
        default_bitrate: 6000,
        default_resolution: "1920x1080".into(),
        default_fps: 30,
        file_browser_url: config.file_browser_url.clone(),
        session_hours: 12,
    };
    sqlx::query("INSERT INTO settings(id,value) VALUES(true,$1) ON CONFLICT DO NOTHING")
        .bind(json!(defaults))
        .execute(&db)
        .await?;
    let saved: Value = sqlx::query_scalar("SELECT value FROM settings WHERE id=true")
        .fetch_one(&db)
        .await?;
    let engine = Arc::new(streaming::MediaMtxEngine {
        client: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .redirect(reqwest::redirect::Policy::none())
            .build()?,
        base: config.mediamtx_api.clone(),
        user: config.mediamtx_user.clone(),
        password: config.mediamtx_password.clone(),
    });
    let (events, _) = broadcast::channel(128);
    let state = AppState {
        db,
        config,
        engine,
        settings: Arc::new(RwLock::new(serde_json::from_value(saved)?)),
        snapshot: Arc::new(RwLock::new(dashboard::Snapshot::default())),
        events,
        relay_enabled: Arc::new(AtomicBool::new(false)),
        active_destinations: Arc::default(),
        control: Arc::default(),
        login_attempts: Arc::default(),
        dummy_hash: Arc::new(auth::hash_password("constant-time-dummy-password")?),
    };
    // A restarted controller must not silently inherit secret forwarding configuration.
    state.engine.configure(vec![]).await.map_err(|_|anyhow::anyhow!("Cannot reach MediaMTX. Verify API credentials and v1.21.0; backend will retry on container restart."))?;
    sqlx::query("UPDATE stream_sessions SET status='interrupted',end_time=now(),duration=EXTRACT(EPOCH FROM now()-start_time)::bigint WHERE end_time IS NULL").execute(&state.db).await?;
    if destinations::rows(&state)
        .await
        .map_err(|_| anyhow::anyhow!("Cannot read destinations"))?
        .is_empty()
    {
        for (kind, name, url, env_key) in [
            (
                "youtube",
                "YouTube",
                "rtmps://a.rtmp.youtube.com/live2",
                "YOUTUBE_STREAM_KEY",
            ),
            (
                "facebook",
                "Facebook",
                "rtmps://live-api-s.facebook.com:443/rtmp",
                "FACEBOOK_STREAM_KEY",
            ),
        ] {
            let endpoint =
                std::env::var(format!("{}_RTMP_URL", kind.to_uppercase())).unwrap_or(url.into());
            let key = std::env::var(env_key)
                .ok()
                .filter(|v| !v.is_empty())
                .map(|s| crypto::encrypt(&state.config.encryption_key, &s))
                .transpose()
                .map_err(|_| anyhow::anyhow!("Credential encryption failed"))?;
            sqlx::query(
                "INSERT INTO destinations(id,name,kind,url,encrypted_key) VALUES($1,$2,$3,$4,$5)",
            )
            .bind(uuid::Uuid::new_v4())
            .bind(name)
            .bind(kind)
            .bind(endpoint)
            .bind(key)
            .execute(&state.db)
            .await?;
        }
    }
    logs::record(
        &state,
        "info",
        "application",
        "Streaming Control Center started; relays are stopped",
    )
    .await;
    let protected = Router::new()
        .route("/api/auth/me", get(auth::me))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/change-password", post(auth::change_password))
        .route("/api/dashboard", get(dashboard::get))
        .route("/api/ws", get(dashboard::websocket))
        .route("/api/stream/status", get(streaming::status))
        .route("/api/stream/start", post(streaming::start))
        .route("/api/stream/stop", post(streaming::stop))
        .route("/api/stream/restart", post(streaming::restart))
        .route("/api/stream/sessions", get(dashboard::sessions))
        .route(
            "/api/destinations",
            get(destinations::list).post(destinations::create),
        )
        .route(
            "/api/destinations/{id}",
            put(destinations::update).delete(destinations::delete),
        )
        .route("/api/settings", get(settings::get).put(settings::update))
        .route("/api/server/stats", get(monitoring::get))
        .route("/api/storage", get(storage::get))
        .route("/api/logs", get(logs::list))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth::protect));
    let app = Router::new()
        .merge(protected)
        .route("/api/health", get(health))
        .route("/api/auth/login", post(auth::login))
        .fallback(|| async {
            error::ApiError(
                axum::http::StatusCode::NOT_FOUND,
                "Endpoint not found".into(),
            )
        })
        .layer(DefaultBodyLimit::max(32768))
        .layer(middleware::from_fn_with_state(state.clone(), auth::csrf))
        .layer(middleware::from_fn(error::normalize))
        .with_state(state.clone());
    let worker = tokio::spawn(dashboard::run(state.clone()));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    tracing::info!("API listening on port 3000");
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown().await;
            // Stop orchestration and media before waiting for HTTP connections
            // to drain. Otherwise an open WebSocket can delay relay shutdown.
            worker.abort();
            let _control = state.control.lock().await;
            if state.engine.configure(vec![]).await.is_err() {
                tracing::error!("Could not stop relay during shutdown");
            }
            let _ = state.events.send("shutdown".into());
        })
        .await?;
    Ok(())
}
async fn shutdown() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("signal handler");
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
