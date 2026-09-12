// Run against a disposable deployment: BASE_URL=http://localhost:3000
// TEST_USER=... TEST_PASSWORD=... node infrastructure/smoke-test.mjs
// Only a temporary custom destination is created and removed. Relay start is
// tested with that destination disabled, so this script never broadcasts.
import assert from 'node:assert/strict';
const base=process.env.BASE_URL || 'http://localhost:3000';
const username=process.env.TEST_USER;
const password=process.env.TEST_PASSWORD;
if(!username||!password)throw new Error('Set TEST_USER and TEST_PASSWORD for a disposable deployment');
let cookie='';
async function request(method,path,body,{authenticated=true,protection=true,origin}={}){
 const headers={'Content-Type':'application/json'};
 if(protection)headers['X-Requested-With']='stream-control';
 if(authenticated&&cookie)headers.Cookie=cookie;
 if(origin)headers.Origin=origin;
 const response=await fetch(`${base}/api${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let payload;try{payload=JSON.parse(text);}catch{throw new Error(`Non-JSON response from ${path}: ${response.status}`);}
 return {status:response.status,payload,cookie:response.headers.get('set-cookie')};
}
assert.equal((await request('GET','/health')).status,200);
assert.equal((await request('GET','/dashboard',undefined,{authenticated:false})).status,401);
assert.equal((await request('POST','/auth/login',{username,password},{protection:false})).status,403);
assert.equal((await request('POST','/auth/login',{username,password},{origin:'https://untrusted.invalid'})).status,403);
assert.equal((await request('POST','/auth/login',{username,password:'incorrect-test-password'})).status,401);
const login=await request('POST','/auth/login',{username,password});assert.equal(login.status,200);assert.ok(login.cookie.includes('HttpOnly'));assert.ok(login.cookie.includes('SameSite=Strict'));cookie=login.cookie.split(';')[0];
assert.equal((await request('GET','/auth/me')).payload.data.username,username);
for(const path of ['/dashboard','/stream/status','/destinations','/settings','/server/stats','/storage','/logs','/stream/sessions'])assert.equal((await request('GET',path)).status,200,path);
const status=(await request('GET','/stream/status')).payload.data;
assert.equal(status.relay_enabled,false,'Use a disposable deployment with relay stopped');
assert.equal(status.engine_online,true,'Real MediaMTX must be reachable');
const current=(await request('GET','/destinations')).payload.data;
assert.ok(current.every(d=>!d.enabled),'All pre-existing destinations must be disabled in the test deployment');
assert.equal((await request('POST','/stream/start',{})).status,400);
const key='INTEGRATION_ONLY_NEVER_A_PLATFORM_KEY';
const draft={name:'Smoke test destination',kind:'custom',enabled:false,url:'rtmp://127.0.0.1:19999/test',stream_key:key,title:'Disposable test',description:''};
const created=await request('POST','/destinations',draft);assert.equal(created.status,200);const id=created.payload.data.id;
try{
 const list=await request('GET','/destinations');const serialized=JSON.stringify(list.payload);assert.ok(!serialized.includes(key));assert.ok(!serialized.includes('encrypted_key'));assert.ok(!serialized.includes('stream_key'));
 assert.equal(list.payload.data.find(d=>d.id===id).key_configured,true);
 const {stream_key:unused,...update}=draft;void unused;
 assert.equal((await request('PUT',`/destinations/${id}`,{...update,title:'Updated'})).status,200);
 const after=(await request('GET','/destinations')).payload.data.find(d=>d.id===id);assert.equal(after.key_configured,true);assert.equal(after.title,'Updated');
 assert.equal((await request('PUT',`/destinations/${id}`,{...update,url:'http://invalid.example'})).status,400);
 assert.equal((await request('PUT',`/destinations/${id}`,{...update,clear_key:true})).status,200);
 assert.equal((await request('GET','/destinations')).payload.data.find(d=>d.id===id).key_configured,false);
}finally{assert.equal((await request('DELETE',`/destinations/${id}`)).status,200);}
assert.ok(!JSON.stringify((await request('GET','/logs')).payload).includes(key));
assert.equal((await request('POST','/stream/stop',{})).status,200);
if(process.env.TEST_ROTATE_PASSWORD==='1'){
 const rotated=password+'-temporary-rotation';
 assert.equal((await request('POST','/auth/change-password',{current_password:'incorrect',new_password:rotated})).status,400);
 assert.equal((await request('POST','/auth/change-password',{current_password:password,new_password:rotated})).status,200);
 assert.equal((await request('GET','/dashboard')).status,401,'Password change revokes the old session');
 assert.equal((await request('POST','/auth/login',{username,password})).status,401,'Old password is rejected');
 const newLogin=await request('POST','/auth/login',{username,password:rotated});assert.equal(newLogin.status,200);cookie=newLogin.cookie.split(';')[0];
 assert.equal((await request('POST','/auth/change-password',{current_password:rotated,new_password:password})).status,200);
 const restored=await request('POST','/auth/login',{username,password});assert.equal(restored.status,200);cookie=restored.cookie.split(';')[0];
 console.log('PASS: password change, current-password validation, session revocation, old-password rejection, and test-password restoration');
}
assert.equal((await request('POST','/auth/logout',{})).status,200);
assert.equal((await request('GET','/dashboard')).status,401);
console.log('PASS: real database/API/MediaMTX health, auth, CSRF, destination CRUD, key omission and retention, validation, logs, stop, and logout revocation');
