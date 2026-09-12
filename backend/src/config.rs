use anyhow::{Context, bail};
use base64::{Engine, engine::general_purpose::STANDARD};

pub struct Config {
    pub database_url: String,
    pub encryption_key: [u8; 32],
    pub admin_user: String,
    pub admin_password: String,
    pub public_origin: String,
    pub secure_cookie: bool,
    pub mediamtx_api: String,
    pub mediamtx_user: String,
    pub mediamtx_password: String,
    pub mediamtx_rtsp: String,
    pub file_browser_url: String,
    pub host_proc: String,
    pub host_sys: String,
    pub root_mount: String,
    pub data_mount: String,
}
fn env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.into())
}
impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let key = STANDARD.decode(
            std::env::var("ENCRYPTION_KEY")
                .context("ENCRYPTION_KEY must contain 32 random bytes in base64")?,
        )?;
        let encryption_key = key
            .try_into()
            .map_err(|_| anyhow::anyhow!("ENCRYPTION_KEY must decode to 32 bytes"))?;
        let admin_password =
            std::env::var("ADMIN_PASSWORD").context("ADMIN_PASSWORD required for first boot")?;
        if admin_password.len() < 12 {
            bail!("ADMIN_PASSWORD must be at least 12 characters");
        }
        let public_origin = env("PUBLIC_ORIGIN", "http://localhost:8088");
        let parsed = url::Url::parse(&public_origin)?;
        if !["http", "https"].contains(&parsed.scheme())
            || parsed.origin().ascii_serialization() != public_origin
        {
            bail!("PUBLIC_ORIGIN must be an HTTP(S) origin without trailing slash");
        }
        Ok(Self {
            database_url: std::env::var("DATABASE_URL").context("DATABASE_URL required")?,
            encryption_key,
            admin_user: env("ADMIN_USER", "admin"),
            admin_password,
            secure_cookie: env("COOKIE_SECURE", "true") == "true",
            public_origin,
            mediamtx_api: env("MEDIAMTX_API_URL", "http://mediamtx:9997"),
            mediamtx_user: env("MEDIAMTX_API_USER", "control"),
            mediamtx_password: std::env::var("MEDIAMTX_API_PASSWORD")
                .context("MEDIAMTX_API_PASSWORD required")?,
            mediamtx_rtsp: env("MEDIAMTX_RTSP_URL", "rtsp://mediamtx:8554/live"),
            file_browser_url: env("FILE_BROWSER_URL", "http://192.168.1.7:8080"),
            host_proc: env("HOST_PROC", "/host/proc"),
            host_sys: env("HOST_SYS", "/host/sys"),
            root_mount: env("HOST_ROOT", "/host/root"),
            data_mount: env("HOST_DATA", "/host/data"),
        })
    }
}
