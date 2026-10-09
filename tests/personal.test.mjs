import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {runtimeSession} from '../src/runtime-session.mjs';
import {validatePersonalConfig,gatewayPersonalConfig,assertPersonalAiInput} from '../src/personal-policy.mjs';
import {LiveAdapters,MockAdapters,mockSignals,ProviderError} from '../src/adapters.mjs';
import {openDb,migrate} from '../src/db.mjs';
import {RevFlow} from '../src/service.mjs';
import {createServer} from '../src/server.mjs';
const knowledge={version:'sales-personal-fixture',approved:true,product:'Portfolio service',claims:[{id:'workflows',text:'I build reviewed workflow automations.'}],allowed_urls:[],cta:'Would you like a discovery conversation?',pricing:null,disclaimer:'',always_require_approval:true};
const config={enabled:true,model_data_acknowledged:true,allowed_emails:['fixture@personal.test'],allowed_domains:['personal.test'],slack_channel:'C0C6V1LKAMN',calendar_id:'primary',hubspot_pipeline:'default',hubspot_deal_stage:'appointmentscheduled',knowledge};
const env={DATA_MODE:'personal',CONNECTOR_GATEWAY_URL:'https://gateway.example/webhook/revflow-connectors',N8N_GATEWAY_TOKEN:'fixture-token',GMAIL_SENDER:'sender@example.net',HUBSPOT_PIPELINE:'default',HUBSPOT_DEAL_STAGE:'appointmentscheduled'};
test('owner session rotates endpoints after closing, expires and denies SSRF or other owner IDs',()=>{
 const state={},session_id=randomUUID(),request={operation:'register',session_id,endpoint:'https://fixture-one.trycloudflare.com',data_mode:'synthetic'};
 runtimeSession(request,state,1000);assert.equal(runtimeSession({operation:'policy',stage:'score',input:{lead_id:randomUUID()}},state,1001).url,request.endpoint+'/stages/score');
 for(const endpoint of ['http://fixture.trycloudflare.com','https://127.0.0.1','https://fixture.trycloudflare.com@evil.test','https://evil.test','https://fixture.trycloudflare.com/path'])assert.throws(()=>runtimeSession({...request,endpoint},state,1001),/SESSION_ENDPOINT_DENIED/);
 assert.throws(()=>runtimeSession({...request,session_id:randomUUID()},state,1001),/SESSION_ALREADY_RUNNING/);assert.throws(()=>runtimeSession({operation:'close',session_id:randomUUID()},state),/SESSION_ID_MISMATCH/);
 assert.throws(()=>runtimeSession({operation:'status'},state,601001),/SESSION_OFFLINE/);assert.throws(()=>runtimeSession({operation:'policy',stage:'http',input:{}},state,1002),/SESSION_STAGE_DENIED/);
 runtimeSession({operation:'close',session_id},state);assert.throws(()=>runtimeSession({operation:'status'},state),/SESSION_OFFLINE/);runtimeSession({...request,endpoint:'https://fixture-two.trycloudflare.com'},state);assert.equal(state.session.endpoint,'https://fixture-two.trycloudflare.com');
});
test('personal mode refuses defaults, missing model acknowledgment and demo knowledge',async()=>{
 const example=JSON.parse(await readFile(new URL('../config/personal.example.json',import.meta.url)));
 assert.throws(()=>validatePersonalConfig(example),/PERSONAL_DATA_NOT_ENABLED/);assert.throws(()=>validatePersonalConfig({...config,model_data_acknowledged:false}));assert.throws(()=>validatePersonalConfig({...config,allowed_emails:[]}));assert.throws(()=>validatePersonalConfig({...config,knowledge:{...knowledge,disclaimer:'Synthetic portfolio knowledge'}}));assert.throws(()=>new LiveAdapters({...env,GMAIL_TEST_RECIPIENT:'sender@example.net'},{personalConfig:config}),/PERSONAL_TEST_OVERRIDE_DENIED/);
 const gateway=gatewayPersonalConfig(config);assert.ok(!JSON.stringify(gateway).includes(config.allowed_emails[0]));assert.ok(!JSON.stringify(gateway).includes(config.allowed_domains[0]));
});
test('personal connector permits only reviewed recipients, routing and approved email content before transfer',async()=>{
 const calls=[];const adapter=new LiveAdapters(env,{personalConfig:config,fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({status:200,body:{id:'fixture',threadId:'fixture'}})};}});
 const email={email:config.allowed_emails[0],subject:`A discovery conversation about ${knowledge.product}`,body:knowledge.claims[0].text+' '+knowledge.cta};
 await adapter.effect('EMAIL_SEND','personal-fixture',email);assert.ok(Buffer.from(calls[0].body.raw,'base64url').toString('utf8').includes('To: fixture@personal.test'));
 await assert.rejects(adapter.effect('EMAIL_SEND','denied',{...email,email:'outside@other.test'}),/PERSONAL_CONNECTOR_DENIED/);await assert.rejects(adapter.effect('EMAIL_SEND','denied',{...email,body:'Guaranteed discounts'}),/PERSONAL_CONNECTOR_DENIED/);assert.equal(calls.length,1);
 await assert.rejects(adapter.hub('/crm/v3/objects/companies','POST',{properties:{domain:'outside.test',name:'Fixture'}}),/PERSONAL_CONNECTOR_DENIED/);
 await assert.rejects(adapter.providerRequest('https://evil.test/api',{method:'GET'}),/PERSONAL_CONNECTOR_DENIED/);assert.equal(calls.length,1);
});
test('personal AI receives bounded redacted fields and cannot accept arbitrary tools or identifying fields',()=>{
 assertPersonalAiInput('qualification',{message:'Please arrange a demo [email].',job_title:'CTO'});
 for(const input of [{message:'Contact fixture@personal.test',job_title:'CTO'},{message:'Demo',job_title:'CTO',email:'fixture@personal.test'},{message:'Demo',job_title:'CTO',tools:['shell']}])assert.throws(()=>assertPersonalAiInput('qualification',input));
 assert.throws(()=>assertPersonalAiInput('outreach',{knowledge:{...knowledge,approved:false}}));
});
test('owner UI submits and tracks a demo through approvals, reply and booking without external effects',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);const app=new RevFlow(db);const auth={NODE_ENV:'production',API_TOKEN:randomBytes(32).toString('hex'),APPROVAL_TOKEN:randomBytes(32).toString('hex'),WEBHOOK_SECRET:randomBytes(32).toString('hex')};const server=createServer(app,auth);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,body,approval=false)=>{const r=await fetch(url+path,{method:'POST',headers:{Authorization:`Bearer ${auth[approval?'APPROVAL_TOKEN':'API_TOKEN']}`,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 try{
  assert.equal((await fetch(url+'/api/workflows/start',{method:'POST',body:'{}'})).status,401);
  const ctx=await post('/api/workflows/start',{});assert.ok(ctx.awaiting_approval);const progress=await (await fetch(url+'/api/events/'+ctx.event_id,{headers:{Authorization:`Bearer ${auth.API_TOKEN}`}})).json();assert.equal(progress.status,'QUALIFIED');assert.equal(progress.route,'HOT');
  const recent=await (await fetch(url+'/api/leads',{headers:{Authorization:`Bearer ${auth.API_TOKEN}`}})).json();assert.equal(recent.leads[0].event_id,ctx.event_id);assert.equal((await fetch(url+'/api/leads')).status,401);
  assert.equal((await app.review(ctx.approval_id)).recipient,(await app.lead(ctx.lead_id)).email);await post('/approvals/'+ctx.approval_id,{decision:'approved'},true);await post('/approvals/'+ctx.approval_id+'/execute',{},true);
  const reply=await post('/api/replies/sample',{lead_id:ctx.lead_id});assert.ok(reply.slots.length);const booking=await post('/api/meeting/select',{lead_id:ctx.lead_id,...reply.slots[0]});assert.ok(booking.awaiting_approval);await post('/approvals/'+booking.approval_id,{decision:'approved'},true);assert.ok((await post('/approvals/'+booking.approval_id+'/execute',{},true)).booked);
  assert.equal((await app.lead(ctx.lead_id)).status,'MEETING_BOOKED');
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('personal WARM leads require approval and nonallowlisted leads never persist',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);await db.query("INSERT INTO config_versions(kind,version,data) VALUES('sales',$1,$2)",[knowledge.version,knowledge]);
 const adapter=new MockAdapters(db);adapter.dataMode='personal';adapter.personalConfig=config;const original=adapter.ai.bind(adapter);adapter.ai=async(task,input,version)=>task==='qualification'?{output:mockSignals(input),model:'fixture',cost_usd:0}:original(task,input,version);const app=new RevFlow(db,adapter);
 try{await assert.rejects(app.pipeline({source:'test',source_event_id:'outside',email:'outside@other.test',message:'Demo'}),/PERSONAL_LEAD_NOT_ALLOWLISTED/);const ctx=await app.pipeline({source:'test',source_event_id:'allowed',email:config.allowed_emails[0],company_name:'Fixture',job_title:'Manager',message:'Pricing for next quarter.',consent:true});assert.equal(ctx.route,'WARM');assert.ok(ctx.awaiting_approval);assert.ok(!(await db.query("SELECT id FROM actions WHERE kind='EMAIL_SEND'")).rows.length);}finally{await db.close();}
});
test('switching mock/live mode isolates company receipts and blocks cross-mode lead actions',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);const app=new RevFlow(db);
 try{
  const input={source:'mode-fixture',source_event_id:'mock-mode',email:'mode@example.com',company_name:'Example Labs',company_domain:'example.com',job_title:'CTO',message:'Demo this month. I own the buying decision.',consent:true};
  const mock=await app.pipeline({...input,runtime_mode:'live'});assert.equal((await app.lead(mock.lead_id)).origin_mode,'mock');
  let effects=0;const live=new MockAdapters(db);live.mode='live';const effect=live.effect.bind(live);live.effect=async(kind,key,payload)=>{effects++;const result=await effect(kind,key,payload);delete result.mock;result.id='123';return result;};app.adapters=live;
  await assert.rejects(app.send(mock),/LEAD_ENVIRONMENT_MISMATCH/);assert.equal(effects,0);
  const real=await app.pipeline({...input,source_event_id:'live-mode',email:'live-mode@example.com'});assert.equal((await app.lead(real.lead_id)).origin_mode,'live');assert.ok(effects>0);
  assert.equal((await db.query("SELECT count(*)::int n FROM actions WHERE kind='CRM_COMPANY'")).rows[0].n,2);
  const oldAction=(await db.query("SELECT action_key,payload FROM actions WHERE lead_id=$1 AND kind='CRM_CONTACT'",[mock.lead_id])).rows[0];await assert.rejects(app.action(real,'CRM_CONTACT',oldAction.action_key,oldAction.payload),/MOCK_RECEIPT_NOT_LIVE/);
  app.adapters=new MockAdapters(db);await assert.rejects(app.send(real),/LEAD_ENVIRONMENT_MISMATCH/);
 }finally{await db.close();}
});

test('connected workers preserve mock retries and skip mock follow-ups and reminders without effects',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);const app=new RevFlow(db);
 try{
  const ctx=await app.pipeline({source:'worker-mode-fixture',source_event_id:'warm',email:'worker-mode@example.com',company_name:'Example',job_title:'Manager',message:'Pricing for next quarter.',consent:true});assert.equal(ctx.sent,true);
  await db.query("UPDATE leads SET next_follow_up_at=now()-interval '1 day' WHERE id=$1",[ctx.lead_id]);
  app.adapters.failures=[new ProviderError('RATE_LIMIT',429)];await assert.rejects(app.action(ctx,'CRM_COMPANY','MODE_WORKER_RETRY',{company_domain:'example.com',company_name:'Example'}));
  await db.query("UPDATE failed_events SET next_retry_at=now()-interval '1 second' WHERE action_key='MODE_WORKER_RETRY'");
  const meeting=(await db.query("INSERT INTO meetings(lead_id,start_at,end_at,status) VALUES($1,now()+interval '1 day',now()+interval '25 hours','booked') RETURNING id",[ctx.lead_id])).rows[0];
  await db.query("INSERT INTO reminders(lead_id,meeting_id,due_at) VALUES($1,$2,now()-interval '1 second')",[ctx.lead_id,meeting.id]);
  const mock=app.adapters;let effects=0;app.adapters={mode:'live',effect:async()=>{effects++;throw Error('UNEXPECTED_EXTERNAL_EFFECT');}};
  assert.equal((await app.retries()).recovered,0);assert.equal((await app.followups()).sent,0);assert.equal((await app.reminders()).reminded,0);assert.equal(effects,0);
  assert.equal((await db.query("SELECT status FROM failed_events WHERE action_key='MODE_WORKER_RETRY'")).rows[0].status,'retry');assert.equal((await db.query('SELECT sent_at FROM reminders WHERE meeting_id=$1',[meeting.id])).rows[0].sent_at,null);
  assert.equal((await db.query("SELECT count(*)::int n FROM lead_events WHERE lead_id=$1 AND event_type='WORKER_ENVIRONMENT_BLOCKED'",[ctx.lead_id])).rows[0].n,3);
  app.adapters=mock;assert.equal((await app.retries()).recovered,1);assert.equal((await app.followups()).sent,1);assert.equal((await app.reminders()).reminded,1);
 }finally{await db.close();}
});
