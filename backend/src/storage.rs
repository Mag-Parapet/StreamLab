use crate::{AppState, config::Config};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Disk {
    pub mount: String,
    pub filesystem: Option<String>,
    pub total_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
    pub free_bytes: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Storage {
    pub raid_status: String,
    pub disk_count: Option<u64>,
    pub raid_level: Option<String>,
    pub sync_progress: Option<String>,
    pub data: Disk,
    pub root: Disk,
}
fn read(path: impl AsRef<std::path::Path>) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|v| v.trim().to_string())
}
pub fn raid_state(state: Option<&str>, degraded: Option<u64>, sync: Option<&str>) -> String {
    match (state, degraded, sync) {
        (Some("inactive" | "clear"), _, _) => "failed",
        (Some(_), _, Some("recover" | "resync" | "reshape")) => "rebuilding",
        (Some(_), Some(n), _) if n > 0 => "degraded",
        (Some("clean" | "active" | "active-idle" | "readonly" | "read-auto"), Some(0), _) => {
            "healthy"
        }
        _ => "unavailable",
    }
    .into()
}
fn disk(path: &str, label: &str, filesystem: Option<String>) -> Disk {
    let mut d = Disk {
        mount: label.into(),
        filesystem,
        ..Default::default()
    };
    #[cfg(target_os = "linux")]
    {
        if let Ok(path) = std::ffi::CString::new(path) {
            let mut stat = std::mem::MaybeUninit::<libc::statvfs>::uninit();
            // statvfs reads filesystem counters; it never mutates the mount.
            if unsafe { libc::statvfs(path.as_ptr(), stat.as_mut_ptr()) } == 0 {
                let stat = unsafe { stat.assume_init() };
                let total = stat.f_blocks * stat.f_frsize;
                let free = stat.f_bfree * stat.f_frsize;
                d.total_bytes = Some(total);
                d.free_bytes = Some(stat.f_bavail * stat.f_frsize);
                d.used_bytes = Some(total.saturating_sub(free));
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = path;
        let _ = &mut d;
    }
    d
}
pub fn sample(config: &Config) -> Storage {
    let base = format!("{}/block/md0/md", config.host_sys);
    let state = read(format!("{base}/array_state"));
    let degraded = read(format!("{base}/degraded")).and_then(|v| v.parse().ok());
    let sync = read(format!("{base}/sync_action"));
    let mounts = read(format!("{}/1/mounts", config.host_proc)).unwrap_or_default();
    let fs = |mount: &str| {
        mounts.lines().find_map(|l| {
            let p: Vec<_> = l.split_whitespace().collect();
            if p.len() > 2 && p[1] == mount {
                Some(p[2].to_string())
            } else {
                None
            }
        })
    };
    let data_fs = fs("/data");
    Storage {
        raid_status: raid_state(state.as_deref(), degraded, sync.as_deref()),
        disk_count: read(format!("{base}/raid_disks")).and_then(|v| v.parse().ok()),
        raid_level: read(format!("{base}/level")),
        sync_progress: read(format!("{base}/sync_completed")),
        data: if data_fs.is_some() {
            disk(&config.data_mount, "/data", data_fs)
        } else {
            Disk {
                mount: "/data".into(),
                ..Default::default()
            }
        },
        root: disk(&config.root_mount, "/", fs("/")),
    }
}
pub async fn get(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"data":state.snapshot.read().await.storage}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classify_raid() {
        assert_eq!(raid_state(Some("clean"), Some(0), Some("idle")), "healthy");
        assert_eq!(
            raid_state(Some("active"), Some(1), Some("recover")),
            "rebuilding"
        );
        assert_eq!(
            raid_state(Some("active"), Some(1), Some("idle")),
            "degraded"
        );
        assert_eq!(
            raid_state(Some("inactive"), Some(2), Some("idle")),
            "failed"
        );
        assert_eq!(raid_state(None, None, None), "unavailable");
    }
}
