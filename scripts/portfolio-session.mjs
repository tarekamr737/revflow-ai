import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {validatePersonalConfig,gatewayPersonalConfig} from '../src/personal-policy.mjs';
const root=new URL('../',import.meta.url);const personal=process.env.DATA_MODE==='personal'?validatePersonalConfig(JSON.parse(process.env.PERSONAL_CONFIG_JSON||'null')):null;
const session_id=randomUUID();const children=[];let endpoint='',closed=false,heartbeat,stopPoll,ownedMetadata=false;
const gateway=process.env.CONNECTOR_GATEWAY_URL;if(!/^https:\/\//.test(gateway||'')||!process.env.N8N_GATEWAY_TOKEN)throw Error('GATEWAY_CONFIGURATION_REQUIRED');
async function session(operation){const body={operation,session_id,...(operation==='register'?{endpoint,data_mode:personal?'personal':'synthetic',...(personal?{acknowledgment:'OWNER_APPROVED_REAL_DATA_AND_MODEL',config:gatewayPersonalConfig(personal)}:{test_recipient_hash:createHash('sha256').update(process.env.GMAIL_TEST_RECIPIENT.trim().toLowerCase()).digest('hex')})}:{})};const r=await fetch(gateway,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.N8N_GATEWAY_TOKEN}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('SESSION_REGISTRATION_FAILED');const data=await r.json();if(!data.ok)throw Error('SESSION_REGISTRATION_REJECTED');return data;}
async function audit(event_type){const r=await fetch('http://127.0.0.1:3100/stages/audit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.API_TOKEN}`},body:JSON.stringify({event_type,correlation_id:session_id}),signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('SESSION_AUDIT_FAILED');}
async function verifyConnection(){
 for(let attempt=0;attempt<15;attempt++){
  try{const r=await fetch(gateway,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.N8N_GATEWAY_TOKEN}`},body:JSON.stringify({operation:'policy',stage:'audit',input:{event_type:'SESSION_STARTED',correlation_id:session_id}}),signal:AbortSignal.timeout(15000),redirect:'error'});if(r.ok&&(await r.json()).recorded===true)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error('HTTPS_POLICY_CONNECTION_UNAVAILABLE');
}
async function close(){if(closed)return;closed=true;clearInterval(heartbeat);clearInterval(stopPoll);try{await session('close');}catch{}for(const child of children)child.kill();if(ownedMetadata){try{await audit('SESSION_CLOSED');}catch{}await rm(new URL('../.tmp/session.json',import.meta.url),{force:true});await rm(new URL('../.tmp/session-stop.json',import.meta.url),{force:true});const restore=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/restore-mock.ps1'],{cwd:root,stdio:'ignore',windowsHide:true});await new Promise(resolve=>{restore.once('exit',resolve);restore.once('error',resolve);});}console.log('Connected session closed.');}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>close().finally(()=>process.exit(0)));
process.on('uncaughtException',()=>close().finally(()=>process.exit(1)));
await mkdir(new URL('../.tmp/',import.meta.url),{recursive:true});
const proxy=spawn(process.execPath,['scripts/test-policy-proxy.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(proxy);proxy.on('error',()=>close());
await new Promise((resolve,reject)=>{proxy.stdout.once('data',resolve);proxy.once('exit',()=>reject(Error('STAGE_PROXY_FAILED')));setTimeout(()=>reject(Error('STAGE_PROXY_TIMEOUT')),10000).unref();});
const tunnelProtocol=process.env.REVFLOW_TUNNEL_PROTOCOL||'http2';
if(!['http2','auto','quic'].includes(tunnelProtocol))throw Error('TUNNEL_PROTOCOL_INVALID');
const tunnel=spawn(fileURLToPath(new URL('../.tools/cloudflared.exe',import.meta.url)),['tunnel','--protocol',tunnelProtocol,'--url','http://127.0.0.1:3102','--no-autoupdate'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(tunnel);
try{
 endpoint=await new Promise((resolve,reject)=>{let output='';const receive=chunk=>{output+=chunk.toString();const found=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(found)resolve(found[0]);};tunnel.stdout.on('data',receive);tunnel.stderr.on('data',receive);tunnel.once('error',reject);tunnel.once('exit',()=>reject(Error('HTTPS_TUNNEL_FAILED')));setTimeout(()=>reject(Error('HTTPS_TUNNEL_TIMEOUT')),45000).unref();});
 await session('register');
 // Heartbeats renew only connection metadata; no lead data or secrets are stored there.
 heartbeat=setInterval(()=>session('register').catch(()=>close()),300000);
 await writeFile(new URL('../.tmp/session.json',import.meta.url),JSON.stringify({session_id,pid:process.pid,data_mode:personal?'personal':'synthetic'}));
 ownedMetadata=true;
 stopPoll=setInterval(async()=>{try{const request=JSON.parse(await readFile(new URL('../.tmp/session-stop.json',import.meta.url),'utf8'));if(request.session_id===session_id){await close();process.exit(0);}}catch{}},1000);
 await verifyConnection();
 console.log('Connected session ready. Keep this terminal running. Ctrl+C closes the tunnel.');
 console.log('Dashboard: http://127.0.0.1:3100');
 for(const child of children)child.once('exit',()=>close());
}catch{await close();throw Error('CONNECTED_SESSION_START_FAILED');}
