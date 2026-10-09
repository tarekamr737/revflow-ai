import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDb,migrate,one} from '../src/db.mjs';
import {RevFlow} from '../src/service.mjs';
import {MockAdapters,LiveAdapters,ProviderError} from '../src/adapters.mjs';
const fixture=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url)))[0];
async function setup(){const db=await openDb({url:null,dir:'memory://'});await migrate(db);const adapter=new MockAdapters(db);adapter.dataMode='synthetic';const app=new RevFlow(db,adapter,{opsAlerts:false});const ctx=await app.normalize(await app.ingest(fixture));await app.qualify(ctx);await app.score(ctx);return {db,adapter,app,ctx};}

test('a missing synthetic company and definitively failed contact recover on the same journey',async()=>{
 const {db,adapter,app,ctx}=await setup();try{
  const originalEffect=adapter.effect.bind(adapter);let current=null,companyWrites=0;
  adapter.effect=async(kind,key,payload)=>{if(kind==='CRM_COMPANY'){companyWrites++;current=await originalEffect(kind,key,payload);return current;}if(kind==='CRM_CONTACT'&&!current)throw new ProviderError('HTTP_400',400);return originalEffect(kind,key,payload);};
  // Seed a prior successful company receipt, then emulate provider-side deletion.
  const {hash}=await import('../src/service.mjs');const companyKey='UPSERT_COMPANY_DOMAIN:mock:'+hash(fixture.company_domain);
  const old=await app.action(ctx,'CRM_COMPANY',companyKey,{company_domain:fixture.company_domain,company_name:fixture.company_name});current=null;
  await assert.rejects(app.crm(ctx),/HTTP_400/);
  let p=await app.progress(ctx.event_id);assert.equal(p.processing_error.stage,'CRM sync');assert.equal(p.processing_error.retrying,false);
  adapter.currentCompany=async()=>current;
  await app.crm(ctx);await app.crm(ctx);
  const sync=await one(db,'SELECT * FROM crm_sync WHERE lead_id=$1',[ctx.lead_id]);assert.notEqual(sync.company_id,old.id);assert.equal(companyWrites,2);
  assert.equal((await one(db,'SELECT result FROM actions WHERE action_key=$1',[companyKey])).result.id,sync.company_id);
  assert.equal((await one(db,"SELECT count(*)::int n FROM lead_events WHERE event_type='CRM_COMPANY_RECONCILED'")).n,1);
  assert.equal((await one(db,"SELECT status FROM actions WHERE action_key=$1",['UPSERT_CONTACT:'+ctx.lead_id])).status,'failed','Preserve the failed receipt');
  assert.equal((await app.progress(ctx.event_id)).processing_error,null);
  const approval=await app.send(await app.draft(ctx));assert.equal(approval.awaiting_approval,true);
  assert.equal((await one(db,"SELECT count(*)::int n FROM actions WHERE kind='EMAIL_SEND'")).n,0);
  assert.equal((await one(db,"SELECT count(*)::int n FROM actions WHERE kind='CRM_CONTACT' AND status='completed'")).n,1);
 }finally{await db.close();}
});

test('personal company deletion requires review and uncertain contact writes cannot be replaced',async()=>{
 const {db,adapter,app,ctx}=await setup();try{
  const {hash}=await import('../src/service.mjs');const key='UPSERT_COMPANY_DOMAIN:mock:'+hash(fixture.company_domain),payload={company_domain:fixture.company_domain,company_name:fixture.company_name};
  const company=await app.action(ctx,'CRM_COMPANY',key,payload);adapter.currentCompany=async()=>null;adapter.dataMode='personal';
  const halted=await app.crm(ctx);assert.equal(halted.halt,true);assert.equal((await app.lead(ctx.lead_id)).status,'MANUAL_REVIEW');
  assert.equal((await one(db,"SELECT count(*)::int n FROM actions WHERE kind='CRM_CONTACT'")).n,0);
  await db.query("UPDATE leads SET status='QUALIFIED' WHERE id=$1",[ctx.lead_id]);adapter.dataMode='synthetic';
  await db.query("INSERT INTO actions(lead_id,correlation_id,action_key,kind,payload_hash,status,payload) VALUES($1,$2,$3,'CRM_CONTACT',$4,'uncertain',$5)",[ctx.lead_id,ctx.correlation_id,'UPSERT_CONTACT:'+ctx.lead_id,hash({}),{email:fixture.email,name:fixture.name,job_title:fixture.job_title,company_id:company.id}]);
  await assert.rejects(app.crm(ctx),/ACTION_RECONCILIATION_REQUIRED/);
  assert.equal((await one(db,"SELECT count(*)::int n FROM actions WHERE kind='CRM_CONTACT' AND status='completed'")).n,0);
 }finally{await db.close();}
});

test('company lookup rejects ambiguous and unverified provider results without a write',async()=>{
 const adapter=new LiveAdapters({DATA_MODE:'synthetic'});const calls=[];adapter.hub=async(...args)=>{calls.push(args);return {results:[{id:'42',properties:{domain:'other.example'}}]};};
 await assert.rejects(adapter.currentCompany('example.net'),/CRM_COMPANY_UNVERIFIED/);
 adapter.hub=async()=>({results:[{},{}]});await assert.rejects(adapter.currentCompany('example.net'),/CRM_AMBIGUOUS_MATCH/);
 assert.equal(calls[0][1],'POST');assert.equal(calls[0][0],'/crm/v3/objects/companies/search');
});
