// Disposable local integration test. Requires a second MediaMTX sink on
// 127.0.0.1:1936 with its API on 127.0.0.1:9998. No external broadcasts.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:3000';
for(const key of ['TEST_USER','TEST_PASSWORD','TEST_OBS_PASSWORD','TEST_FFMPEG'])if(!process.env[key])throw new Error(`Set ${key}`);
let cookie='';let destination;let source;
async function api(method,path,body){const r=await fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json','X-Requested-With':'stream-control',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw new Error(`${path}: ${r.status} ${value.error?.message}`);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value.data;}
async function until(fn,message){for(let i=0;i<25;i++){const v=await fn();if(v)return v;await delay(1000);}throw new Error(message);}
await api('POST','/auth/login',{username:process.env.TEST_USER,password:process.env.TEST_PASSWORD});
assert.equal((await api('GET','/stream/status')).relay_enabled,false);
assert.ok((await api('GET','/destinations')).every(d=>!d.enabled),'Pre-existing destinations must be disabled');
try{
 destination=await api('POST','/destinations',{name:'Local relay acceptance test',kind:'custom',enabled:true,url:'rtmp://127.0.0.1:1936/relay',stream_key:'test',title:'Synthetic test only',description:''});
 source=spawn(process.env.TEST_FFMPEG,['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc2=size=640x360:rate=15','-f','lavfi','-i','sine=frequency=1000:sample_rate=44100','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-b:v','600k','-c:a','aac','-f','flv',`rtmp://127.0.0.1:1935/live?user=obs&pass=${process.env.TEST_OBS_PASSWORD}`],{stdio:'ignore',windowsHide:true});
 source.on('error',()=>{});
 const input=await until(async()=>{const s=await api('GET','/stream/status');return s.obs_connected&&s.bitrate_mbps>0?s:false;},'Publisher/bitrate not detected');
 assert.equal(input.resolution,'640 × 360');assert.equal(input.codec,'H264');assert.equal(input.fps,null);
 await api('POST','/stream/start',{});
 try { await until(async()=>{const s=await api('GET','/stream/status');return s.destinations.some(d=>d.id===destination.id&&d.status==='forwarding');},'Forwarding not confirmed'); }
 catch(error) {
  const s=await api('GET','/stream/status');console.error({engine:s.engine_online,obs:s.obs_connected,relay:s.relay_enabled,destinations:s.destinations.map(d=>({name:d.name,status:d.status})),publisherExitCode:source.exitCode});
  if(process.env.TEST_ENGINE_PASSWORD){const r=await fetch('http://127.0.0.1:9997/v3/paths/forward-dests/list?path=live',{headers:{Authorization:'Basic '+Buffer.from('control:'+process.env.TEST_ENGINE_PASSWORD).toString('base64')}});const value=await r.json();console.error({engineStatus:r.status,forwards:value.items?.map(f=>({pos:f.pos,state:f.state,error:f.lastError?.replace(/rtmps?:\/\/\S+/g,'[redacted endpoint]')}))});}
  throw error;
 }
 const sink=await (await fetch('http://127.0.0.1:9998/v3/paths/get/relay/test')).json();assert.equal(sink.online,true);
 assert.ok(sink.inboundBytes>0,'Sink receives real media bytes');
 console.log('PASS: synthetic H264/AAC input detected; measured bitrate/resolution; native MediaMTX forwarding received by independent local sink');
 await api('POST','/stream/restart',{});
 await until(async()=>{const s=await api('GET','/stream/status');return s.destinations.some(d=>d.id===destination.id&&d.status==='forwarding');},'Restart not confirmed');
 await api('POST','/stream/stop',{});
 await until(async()=>{const s=await api('GET','/stream/status');return !s.relay_enabled&&s.obs_connected;},'Stop must preserve OBS ingest');
 source.kill();source=null;
 await until(async()=>!(await api('GET','/stream/status')).obs_connected,'Publisher disconnect not detected');
 const sessions=await api('GET','/stream/sessions');assert.ok(sessions.some(s=>s.status==='ended'&&s.resolution==='640 × 360'&&s.duration>0));
 console.log('PASS: restart, stop while preserving ingest, publisher disconnect, and persisted ended session');
}finally{
 source?.kill();await api('POST','/stream/stop',{}).catch(()=>{});
 if(destination)await api('DELETE',`/destinations/${destination.id}`);
 await api('POST','/auth/logout',{});
}
