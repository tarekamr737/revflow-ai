import http from 'node:http';
import {scenarios,scenarioFromEvent} from './scenarios.mjs';
import {readFile} from 'node:fs/promises';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openDb,migrate} from './db.mjs';
import {RevFlow} from './service.mjs';
import {MockAdapters,LiveAdapters} from './adapters.mjs';
import {validatePersonalConfig} from './personal-policy.mjs';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function workflowInfo(mode){
 if(mode!=='live')return null;
 try{const config=JSON.parse(await readFile(new URL('../config/n8n.json',import.meta.url),'utf8'));if(!/^https:\/\/[a-z0-9-]+\.app\.n8n\.cloud$/.test(config.instance)||! /^[a-zA-Z0-9_-]{1,80}$/.test(config.workflow_id))return null;return {url:config.instance+'/workflow/'+config.workflow_id};}catch{return null;}
}
export function createServer(service,env=process.env){
 const production=env.NODE_ENV==='production';if(production&&[env.API_TOKEN,env.APPROVAL_TOKEN,env.WEBHOOK_SECRET].some(x=>!x||x.length<32))throw Error('STRONG_AUTH_SECRETS_REQUIRED');
 if(production&&env.API_TOKEN===env.APPROVAL_TOKEN)throw Error('SEPARATE_APPROVER_CREDENTIAL_REQUIRED');
 return http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   const requestedPath=new URL(req.url,'http://localhost').pathname;
   const path=({'/api/workflows/start':'/api/demo','/api/replies/sample':'/api/demo/reply'})[requestedPath]||requestedPath;
   if(path==='/health'){await service.db.query('SELECT 1');return send(200,{ok:true,mode:service.adapters.mode});}
   if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){const file=path==='/'?'index.html':path.slice(1);const content=await readFile(new URL(`../dashboard/${file}`,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'});return res.end(content);}
   const approval=path.startsWith('/approvals/');const token=approval?env.APPROVAL_TOKEN:env.API_TOKEN;
   if(path!=='/webhooks/lead'&&(token?!equal(req.headers.authorization,`Bearer ${token}`):production||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)))return send(401,{error:'UNAUTHORIZED'});
   if(req.method==='GET'&&path==='/api/dashboard')return send(200,{...await service.dashboard(),data_mode:service.adapters.dataMode||'synthetic',workflow:await workflowInfo(service.adapters.mode),auth:{approver_required:!!env.APPROVAL_TOKEN||production}});
   if(req.method==='GET'&&/^\/api\/events\/[a-f0-9-]{36}$/.test(path))return send(200,await service.progress(path.split('/')[3]));
   if(req.method==='GET'&&path==='/api/leads')return send(200,{leads:await service.recentLeads()});
   if(approval&&req.method==='GET')return send(200,await service.review(path.split('/')[2]));
   if(req.method!=='POST')return send(404,{error:'NOT_FOUND'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return send(413,{error:'PAYLOAD_TOO_LARGE'});}
   if(path==='/webhooks/lead'){
    if(!env.WEBHOOK_SECRET)return send(503,{error:'WEBHOOK_NOT_CONFIGURED'});
    const timestamp=req.headers['x-revflow-timestamp'],nonce=req.headers['x-revflow-nonce'],signature=req.headers['x-revflow-signature'];
    if(!/^\d{13}$/.test(timestamp||'')||Math.abs(Date.now()-Number(timestamp))>300000||!/^[-\w]{16,100}$/.test(nonce||''))return send(401,{error:'WEBHOOK_AUTH_INVALID'});
    const expected=createHmac('sha256',env.WEBHOOK_SECRET).update(`${timestamp}.${nonce}.${raw}`).digest('hex');if(!equal(signature,expected))return send(401,{error:'WEBHOOK_AUTH_INVALID'});
    const inserted=await service.db.query('INSERT INTO webhook_nonces(nonce) VALUES($1) ON CONFLICT DO NOTHING RETURNING nonce',[nonce]);if(!inserted.rows.length)return send(409,{error:'WEBHOOK_REPLAY'});
    const input=JSON.parse(raw);const ctx=await service.ingest(input);
    // n8n receives only a persisted event reference, never auth headers or raw PII.
    if(!ctx.halt&&env.N8N_INGEST_URL){if(!env.N8N_INBOUND_TOKEN)throw Error('N8N_AUTH_NOT_CONFIGURED');const r=await fetch(env.N8N_INGEST_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.N8N_INBOUND_TOKEN}`},body:JSON.stringify(ctx),signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('N8N_DISPATCH_FAILED');}
    return send(202,ctx);
   }
   let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'INVALID_JSON'});}
   if(path==='/api/demo/reply'||path==='/api/replies'||path==='/api/meeting/select'){
    const ctx={lead_id:body.lead_id,correlation_id:randomUUID()};const l=await service.lead(ctx.lead_id);
    let stage;
    if(path==='/api/demo/reply'){
     if(service.adapters.dataMode==='personal'||l.source!=='portfolio')return send(409,{error:'SYNTHETIC_DEMO_REQUIRED'});
     if(l.status!=='CONTACTED')return send(409,{error:'SEND_APPROVED_EMAIL_FIRST'});
     stage='reply';Object.assign(ctx,{message:scenarios[scenarioFromEvent(l.source_event_id)].reply,provider_id:'portfolio-reply-'+l.id});
    }else if(path==='/api/replies'){
     if(service.adapters.dataMode!=='personal'||l.status!=='CONTACTED'||typeof body.message!=='string'||!body.message.trim()||body.message.length>8000||! /^(?:owner-reply-)[a-f0-9-]{36}$/.test(body.provider_id||''))return send(409,{error:'PERSONAL_REPLY_INVALID'});
     stage='reply';Object.assign(ctx,{message:body.message,provider_id:body.provider_id});
    }else{stage='meeting';Object.assign(ctx,{operation:'book',start:body.start,end:body.end});}
    if(service.adapters.mode==='mock')return send(200,await service[stage](ctx));
    const target=env['N8N_'+stage.toUpperCase()+'_URL'];if(!target||!env.N8N_INBOUND_TOKEN)return send(503,{error:'CONNECTED_SESSION_REQUIRED'});
    const r=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.N8N_INBOUND_TOKEN}`},body:JSON.stringify(ctx),signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('N8N_DISPATCH_FAILED');return send(202,{queued:true});
   }
   if(path==='/api/leads'||path==='/api/demo'){
    if(service.adapters.mode==='live'&&(!env.N8N_INGEST_URL||!env.N8N_INBOUND_TOKEN))return send(503,{error:'CONNECTED_SESSION_REQUIRED'});
    let input=body;
    if(path==='/api/demo'){
     if(service.adapters.dataMode==='personal')return send(409,{error:'DEMO_REQUIRES_SYNTHETIC_MODE'});
     const scenario=body.scenario||'meeting';if(!Object.hasOwn(scenarios,scenario))return send(400,{error:'UNKNOWN_SCENARIO'});
     const seeds=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url),'utf8'));
     input={...seeds[0],source:'portfolio',source_event_id:`scenario-${scenario}-${randomUUID()}`,email:`${scenario}-${randomUUID()}@example.net`,company_name:'Example Operations',company_domain:'example.net'};
    }
    if(service.adapters.mode==='mock')return send(200,await service.pipeline(input));
    const ctx=await service.ingest(input);
    if(!ctx.halt){const r=await fetch(env.N8N_INGEST_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.N8N_INBOUND_TOKEN}`},body:JSON.stringify(ctx),signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('N8N_DISPATCH_FAILED');}
    return send(202,{...ctx,queued:!ctx.halt});
   }
   if(approval){const id=path.split('/')[2];if(path.endsWith('/execute')){const action=await service.approvalContext(id);const target=env[`N8N_${action.stage.toUpperCase()}_URL`];if(target){const r=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.N8N_INBOUND_TOKEN}`},body:JSON.stringify(action.ctx),signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('N8N_DISPATCH_FAILED');return send(202,{queued:true});}if(service.adapters.mode!=='mock')return send(503,{error:'N8N_RESUME_NOT_CONFIGURED'});return send(200,await service[action.stage](action.ctx));}return send(200,await service.approve(id,body.decision,'authenticated-approver',body.edited||null));}
   const stage=path.match(/^\/stages\/([a-z]+)$/)?.[1];const allowed=['ingest','normalize','enrich','qualify','score','crm','draft','send','reply','meeting','fail','followups','retries','reminders','audit','evaluate','gmail'];
   if(stage&&allowed.includes(stage))return send(200,await service[stage](body));
   return send(404,{error:'NOT_FOUND'});
  }catch(error){const correlation_id=randomUUID();try{await service.fail({correlation_id,error_code:'REQUEST_FAILED',status:400});}catch{}const safeCodes=['PERSONAL_LEAD_NOT_ALLOWLISTED','PERSONAL_CONNECTOR_DENIED','PERSONAL_AI_PII_DENIED','LEAD_ENVIRONMENT_MISMATCH','MOCK_RECEIPT_NOT_LIVE'];return send(safeCodes.includes(error.message)?403:400,{error:safeCodes.includes(error.message)?error.message:'REQUEST_REJECTED',correlation_id});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.env.DATA_MODE==='personal'){const tracing=JSON.parse(await readFile(new URL('../docs/workflow-tracing.json',import.meta.url),'utf8'));if(tracing.enabled)throw Error('DISABLE_SYNTHETIC_EXECUTION_TRACING_BEFORE_PERSONAL_MODE');}const db=await openDb();if(!process.env.DATABASE_URL)await migrate(db);else await db.query('SELECT 1 FROM schema_migrations LIMIT 1');const mode=process.env.ADAPTER_MODE||'mock';if(!['mock','live'].includes(mode))throw Error('INVALID_ADAPTER_MODE');const personalConfig=process.env.DATA_MODE==='personal'?validatePersonalConfig(JSON.parse(process.env.PERSONAL_CONFIG_JSON||'null')):null;const service=new RevFlow(db,mode==='live'?new LiveAdapters(process.env,{personalConfig}):new MockAdapters(db));const server=createServer(service);server.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>console.log(`RevFlow ${mode} listening on port ${process.env.PORT||3100}`));for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(async()=>{await db.close();process.exit(0);}));}
