import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {openDb,migrate,one} from '../src/db.mjs';
import {RevFlow} from '../src/service.mjs';
import {createServer} from '../src/server.mjs';
import {gmailInput} from '../src/gmail-input.mjs';
import {connectorPolicy} from '../src/connector-policy.mjs';
import {ProviderError} from '../src/adapters.mjs';
let db,app,server,url;const env={NODE_ENV:'production',API_TOKEN:randomBytes(32).toString('hex'),APPROVAL_TOKEN:randomBytes(32).toString('hex'),WEBHOOK_SECRET:randomBytes(32).toString('hex')};
const lead={source:'ops-test',source_event_id:'approval-ui',email:'review@example.com',job_title:'CTO',company_name:'Synthetic Company',message:'Demo this month. I own the buying decision.',consent:true};
before(async()=>{db=await openDb({url:null,dir:'memory://'});await migrate(db);app=new RevFlow(db);server=createServer(app,env);await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));await db.close();});
test('approver can review exact content, approve and resume; API role cannot review',async()=>{
 const ctx=await app.pipeline(lead),path=`/approvals/${ctx.approval_id}`,headers={Authorization:`Bearer ${env.APPROVAL_TOKEN}`,'Content-Type':'application/json'};
 assert.equal((await fetch(url+path,{headers:{Authorization:`Bearer ${env.API_TOKEN}`}})).status,401);
 const review=await (await fetch(url+path,{headers})).json();assert.equal(review.original.draft.subject,'A discovery conversation about RevFlow AI');
 assert.equal((await fetch(url+path,{method:'POST',headers,body:JSON.stringify({decision:'approved'})})).status,200);
 const result=await (await fetch(url+path+'/execute',{method:'POST',headers,body:'{}'})).json();assert.equal(result.sent,true);
 assert.equal((await app.review(ctx.approval_id)).decision,'consumed');assert.equal((await fetch(url+path+'/execute',{method:'POST',headers,body:'{}'})).status,400);
});
test('Gmail maps replies only by matching sender and persisted outbound thread',async()=>{
 const sent=await one(db,"SELECT thread_id FROM messages WHERE direction='outbound' AND status='sent' LIMIT 1");
 const mail={id:'gmail-reply-test',threadId:sent.thread_id,from:{value:[{address:lead.email}]},text:'Can we schedule a meeting?'};
 const resolved=await app.gmail(mail);assert.equal(resolved.mode,'reply');const reply=await app.reply(resolved.ctx);assert.ok(reply.slots.length>0);for(const slot of reply.slots)assert.equal(await app.adapters.available(slot.start,slot.end),true);
 assert.equal((await app.gmail({...mail,from:'another@example.com'})).mode,'new');assert.equal((await app.gmail({...mail,threadId:'unrelated'})).mode,'new');assert.equal(gmailInput({...mail,from:'Person <new@example.com>'}).consent,false);
 assert.throws(()=>gmailInput({...mail,from:'bad'}),/INVALID_GMAIL_SENDER/);
});
test('connector policy denies alternate hosts, URL credentials and unsupported methods',()=>{
 assert.equal(connectorPolicy({url:'https://slack.com/api/chat.postMessage',method:'POST'}).service,'slack');
 for(const url of ['https://slack.com@evil.example/api/chat.postMessage','https://slack.com/api/chat.postMessage#secret','http://slack.com/api/chat.postMessage','https://slack.com/api/auth.test'])assert.throws(()=>connectorPolicy({url,method:'POST'}));
 assert.throws(()=>connectorPolicy({url:'https://slack.com/api/chat.postMessage',method:'DELETE'}));
});
test('permanent global failures emit one auditable alert; alert failure cannot recurse',async()=>{
 const correlation_id=randomUUID();await app.fail({correlation_id,error_code:'SYNTHETIC_GLOBAL_ERROR',status:401});assert.ok(await one(db,"SELECT id FROM actions WHERE correlation_id=$1 AND kind='ALERT' AND status='completed'",[correlation_id]));
 const effect=app.adapters.effect;let calls=0;app.adapters.effect=async()=>{calls++;throw new ProviderError('ALERT_DOWN',401);};await app.fail({correlation_id:randomUUID(),status:401});assert.equal(calls,1);app.adapters.effect=effect;
});
test('send retry rechecks approval expiry before making an external effect',async()=>{
 const ctx=await app.pipeline({...lead,source_event_id:'expired-send',email:'expired-send@example.com'});await app.approve(ctx.approval_id,'approved','fixture');app.adapters.failures=[new ProviderError('RATE_LIMIT',429)];await assert.rejects(app.send(ctx));
 await db.query("UPDATE approval_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[ctx.approval_id]);await db.query("UPDATE failed_events SET next_retry_at=now()-interval '1 second' WHERE action_key=$1",[`SEND_INITIAL_EMAIL:${ctx.lead_id}`]);
 assert.equal((await app.retries()).recovered,0);assert.equal((await one(db,"SELECT count(*)::int n FROM mock_effects WHERE action_key=$1",[`SEND_INITIAL_EMAIL:${ctx.lead_id}`])).n,0);
});
test('follow-up retry stops after a prospect replies',async()=>{
 let ctx=await app.pipeline({...lead,source_event_id:'follow-retry',email:'follow-retry@example.com',job_title:'Manager',message:'Pricing for next quarter.'});assert.equal(ctx.sent,true);await db.query("UPDATE leads SET next_follow_up_at=now()-interval '1 day' WHERE id=$1",[ctx.lead_id]);app.adapters.failures=[new ProviderError('RATE_LIMIT',429)];await assert.rejects(app.followups());
 await app.reply({...ctx,message:'Please explain the product?',provider_id:'reply-before-retry'});await db.query("UPDATE failed_events SET next_retry_at=now()-interval '1 second' WHERE action_key=$1",[`FOLLOWUP:${ctx.lead_id}:1`]);assert.equal((await app.retries()).recovered,0);assert.equal((await app.lead(ctx.lead_id)).follow_up_count,0);
});
test('recovered initial email commits the receipt, thread, state and approval once',async()=>{
 const ctx=await app.pipeline({...lead,source_event_id:'recover-initial',email:'recover-initial@example.com'});await app.approve(ctx.approval_id,'approved','fixture');app.adapters.failures=[new ProviderError('RATE_LIMIT',429)];await assert.rejects(app.send(ctx));const key=`SEND_INITIAL_EMAIL:${ctx.lead_id}`;
 await db.query("UPDATE failed_events SET next_retry_at=now()-interval '1 second' WHERE action_key=$1",[key]);assert.equal((await app.retries()).recovered,1);assert.equal((await app.lead(ctx.lead_id)).status,'CONTACTED');assert.equal((await app.review(ctx.approval_id)).decision,'consumed');const m=await one(db,"SELECT * FROM messages WHERE lead_id=$1 AND status='sent'",[ctx.lead_id]);assert.ok(m.thread_id);assert.equal((await app.send(ctx)).sent,true);assert.equal((await app.retries()).recovered,0);assert.equal((await one(db,'SELECT count(*)::int n FROM mock_effects WHERE action_key=$1',[key])).n,1);
});
test('recovered follow-up persists a reply thread and advances the counter once',async()=>{
 const ctx=await app.pipeline({...lead,source_event_id:'recover-followup',email:'recover-followup@example.com',job_title:'Manager',message:'Pricing for next quarter.'});await db.query("UPDATE leads SET next_follow_up_at=now()-interval '1 day' WHERE id=$1",[ctx.lead_id]);app.adapters.failures=[new ProviderError('RATE_LIMIT',429)];await assert.rejects(app.followups());const key=`FOLLOWUP:${ctx.lead_id}:1`;
 await db.query("UPDATE failed_events SET next_retry_at=now()-interval '1 second' WHERE action_key=$1",[key]);assert.equal((await app.retries()).recovered,1);assert.equal((await app.lead(ctx.lead_id)).follow_up_count,1);const receipt=await one(db,'SELECT result FROM actions WHERE action_key=$1',[key]);const mail={id:'recovered-followup-reply',from:'recover-followup@example.com',threadId:receipt.result.threadId,text:'Please explain the product?'};assert.equal((await app.gmail(mail)).mode,'reply');assert.equal((await app.retries()).recovered,0);assert.equal((await app.followups()).sent,0);
});
