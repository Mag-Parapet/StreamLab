use crate::{AppState, config::Config};
use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, time::Instant};
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct NetworkInterface {
    pub name: String,
    pub state: String,
}
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct ServerStats {
    pub available: bool,
    pub cpu_percent: Option<f64>,
    pub load_average: Option<String>,
    pub temperature_c: Option<f64>,
    pub ram_used_bytes: Option<u64>,
    pub ram_total_bytes: Option<u64>,
    pub ram_available_bytes: Option<u64>,
    pub upload_mbps: Option<f64>,
    pub download_mbps: Option<f64>,
    pub interfaces: Vec<NetworkInterface>,
    pub hostname: Option<String>,
    pub os: Option<String>,
    pub kernel: Option<String>,
    pub uptime_seconds: Option<u64>,
}
#[derive(Default)]
pub struct Monitor {
    previous_cpu: Option<(u64, u64)>,
    previous_net: Option<(u64, u64, Instant)>,
}
fn read(path: String) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|v| v.trim().to_string())
}
impl Monitor {
    pub fn sample(&mut self, c: &Config) -> ServerStats {
        let mut out = ServerStats::default();
        let proc = &c.host_proc;
        if let Some(stat) = read(format!("{proc}/stat"))
            && let Some(line) = stat.lines().next()
        {
            let values: Vec<u64> = line
                .split_whitespace()
                .skip(1)
                .filter_map(|v| v.parse().ok())
                .collect();
            if values.len() >= 4 {
                let total = values.iter().take(8).sum::<u64>();
                let idle = values[3] + values.get(4).copied().unwrap_or(0);
                if let Some((old_total, old_idle)) = self.previous_cpu {
                    let delta = total.saturating_sub(old_total);
                    if delta > 0 {
                        out.cpu_percent = Some(
                            (100.0 * (1.0 - idle.saturating_sub(old_idle) as f64 / delta as f64))
                                .clamp(0.0, 100.0),
                        );
                    }
                }
                self.previous_cpu = Some((total, idle));
                out.available = true;
            }
        }
        if let Some(mem) = read(format!("{proc}/meminfo")) {
            let fields: HashMap<_, _> = mem
                .lines()
                .filter_map(|l| {
                    let mut p = l.split_whitespace();
                    Some((
                        p.next()?.trim_end_matches(':').to_owned(),
                        p.next()?.parse::<u64>().ok()? * 1024,
                    ))
                })
                .collect();
            out.ram_total_bytes = fields.get("MemTotal").copied();
            out.ram_available_bytes = fields.get("MemAvailable").copied();
            out.ram_used_bytes = out
                .ram_total_bytes
                .zip(out.ram_available_bytes)
                .map(|(t, a)| t.saturating_sub(a));
        }
        if let Some(net) = read(format!("{proc}/1/net/dev")) {
            let mut rx = 0;
            let mut tx = 0;
            for line in net.lines().skip(2) {
                if let Some((name, counters)) = line.split_once(':') {
                    let name = name.trim();
                    if name == "lo"
                        || name.starts_with("veth")
                        || name.starts_with("docker")
                        || name.starts_with("br-")
                    {
                        continue;
                    }
                    let v: Vec<u64> = counters
                        .split_whitespace()
                        .filter_map(|v| v.parse().ok())
                        .collect();
                    if v.len() >= 9 {
                        rx += v[0];
                        tx += v[8];
                        out.interfaces.push(NetworkInterface {
                            name: name.into(),
                            state: read(format!("{}/class/net/{name}/operstate", c.host_sys))
                                .unwrap_or("unknown".into()),
                        });
                    }
                }
            }
            let now = Instant::now();
            if let Some((pr, pt, time)) = self.previous_net {
                let seconds = now.duration_since(time).as_secs_f64();
                out.download_mbps = Some((rx.saturating_sub(pr)) as f64 * 8.0 / seconds / 1e6);
                out.upload_mbps = Some((tx.saturating_sub(pt)) as f64 * 8.0 / seconds / 1e6);
            }
            self.previous_net = Some((rx, tx, now));
        }
        out.hostname = read(format!("{proc}/sys/kernel/hostname"));
        out.kernel = read(format!("{proc}/sys/kernel/osrelease"));
        out.os = read(format!("{}/etc/os-release", c.root_mount)).and_then(|s| {
            s.lines().find_map(|l| {
                l.strip_prefix("PRETTY_NAME=")
                    .map(|v| v.trim_matches('"').into())
            })
        });
        out.load_average = read(format!("{proc}/loadavg"))
            .map(|v| v.split_whitespace().take(3).collect::<Vec<_>>().join(" / "));
        out.uptime_seconds = read(format!("{proc}/uptime")).and_then(|v| {
            v.split_whitespace()
                .next()?
                .parse::<f64>()
                .ok()
                .map(|n| n as u64)
        });
        if let Ok(entries) = std::fs::read_dir(format!("{}/class/thermal", c.host_sys)) {
            for entry in entries.flatten() {
                let p = entry.path();
                let kind = std::fs::read_to_string(p.join("type")).unwrap_or_default();
                if kind.contains("x86_pkg_temp") || kind.contains("cpu") {
                    out.temperature_c = std::fs::read_to_string(p.join("temp"))
                        .ok()
                        .and_then(|v| v.trim().parse::<f64>().ok())
                        .map(|n| n / 1000.0);
                    break;
                }
            }
        }
        out
    }
}
pub async fn get(State(state): State<AppState>) -> Json<Value> {
    Json(json!({"data":state.snapshot.read().await.server}))
}
