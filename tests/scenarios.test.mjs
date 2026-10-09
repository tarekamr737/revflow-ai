import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDb,migrate,one} from '../src/db.mjs';
import {RevFlow} from '../src/service.mjs';
import {MockAdapters} from '../src/adapters.mjs';
import {createServer} from '../src/server.mjs';
import {assertSyntheticConnector} from '../src/synthetic-connector.mjs';

test('guided question and unsubscribe use real policy paths and suppress duplicate task/alert effects',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);
 const service=new RevFlow(db,new MockAdapters(db));
 const seed=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url)))[0];
 try{
  for(const scenario of ['question','unsubscribe']){
   const ctx=await service.pipeline({...seed,source:'portfolio',source_event_id:'scenario-'+scenario+'-test',email:scenario+'-test@example.net'});
   await service.approve(ctx.approval_id,'approved','test-approver');await service.send(ctx);
   const reply={...ctx,provider_id:'scenario-reply-'+scenario,message:scenario==='question'?'Please explain the product?':'Please unsubscribe me.'};
   await service.reply(reply);assert.equal((await service.reply(reply)).duplicate,true);
   const counts=await one(db,"SELECT count(*) FILTER (WHERE kind='CRM_TASK' AND status='completed')::int tasks,count(*) FILTER (WHERE kind='ALERT' AND payload->>'code'=$2 AND status='completed')::int alerts FROM actions WHERE lead_id=$1",[ctx.lead_id,scenario==='question'?'REPLY_REVIEW_REQUESTED':'OPTED_OUT']);
   assert.equal(counts.tasks,scenario==='question'?1:0);assert.equal(counts.alerts,1);
   const lead=await service.lead(ctx.lead_id);
   if(scenario==='unsubscribe'){assert.equal(lead.opted_out,true);assert.equal(lead.consent,false);assert.equal(lead.next_follow_up_at,null);}
   else assert.equal(lead.status,'RESPONDED');
  }
 }finally{await db.close();}
});

test('scenario API only accepts fixed situations and reopens the correct reply after tracking',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);
 const service=new RevFlow(db,new MockAdapters(db));
 const server=createServer(service,{API_TOKEN:'workspace',APPROVAL_TOKEN:'approver'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer workspace','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/workflows/start',{scenario:'arbitrary'})).status,400);
  const response=await post('/api/workflows/start',{scenario:'question'});assert.equal(response.status,200);
  const ctx=await response.json();const lead=await service.lead(ctx.lead_id);assert.match(lead.source_event_id,/^scenario-question-/);
  await service.approve(ctx.approval_id,'approved','test-approver');await service.send(ctx);
  assert.equal((await post('/api/replies/sample',{lead_id:ctx.lead_id})).status,200);
  assert.equal((await service.lead(ctx.lead_id)).status,'RESPONDED');
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});

test('synthetic Slack gate allows bounded scenario alerts and rejects arbitrary text',()=>{
 const request=code=>({body:{channel:'C0C6V1LKAMN',text:`RevFlow ${code}. Correlation: 11111111-1111-4111-8111-111111111111`}});
 for(const code of ['REPLY_REVIEW_REQUESTED','OPTED_OUT'])assert.doesNotThrow(()=>assertSyntheticConnector(request(code)));
 assert.throws(()=>assertSyntheticConnector(request('UNRESTRICTED')));
});

test('high-confidence meeting intent checks calendar even when the model selects read_lead',async()=>{
 const db=await openDb({url:null,dir:'memory://'});await migrate(db);
 const adapters=new MockAdapters(db),service=new RevFlow(db,adapters);
 const originalAi=adapters.ai.bind(adapters);
 const firstDay=new Date();firstDay.setUTCDate(firstDay.getUTCDate()+3);firstDay.setUTCHours(23,59,59,999);
 adapters.available=async start=>Date.parse(start)>firstDay.getTime();
 adapters.ai=async(task,...args)=>task==='reply'?{output:{intent:'meeting',confidence:0.95,tool:'read_lead'},model:'fixture',usage:{}}:originalAi(task,...args);
 try{
  const seed=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url)))[0];
  const ctx=await service.pipeline({...seed,email:'meeting-routing@example.net',source_event_id:'meeting-routing'});
  await service.approve(ctx.approval_id,'approved','test-approver');await service.send(ctx);
  const result=await service.reply({...ctx,provider_id:'meeting-routing',message:'Can we schedule a meeting?'});
  assert.equal(result.slots.length,3);assert.ok(result.slots.every(slot=>Date.parse(slot.start)>firstDay.getTime()));assert.equal((await service.lead(ctx.lead_id)).status,'MEETING_PROPOSED');
 }finally{await db.close();}
});
