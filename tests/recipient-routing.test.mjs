import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveAdapters} from '../src/adapters.mjs';
import {assertSyntheticConnector} from '../src/synthetic-connector.mjs';
import {identityHash} from '../src/personal-policy.mjs';
import {runtimeSession} from '../src/runtime-session.mjs';
import {openDb,migrate,one} from '../src/db.mjs';
import {RevFlow} from '../src/service.mjs';
import {MockAdapters} from '../src/adapters.mjs';
import {readFile} from 'node:fs/promises';

const inbox='chosen-inbox@fixture.test';
const env={CONNECTOR_GATEWAY_URL:'https://gateway.example.com/webhook/revflow-connectors',N8N_GATEWAY_TOKEN:'fixture-token',GMAIL_TEST_RECIPIENT:inbox,GMAIL_SENDER:'sender@fixture.test'};
const response=body=>({ok:true,status:200,json:async()=>({status:200,body})});
test('synthetic calendar routes only to the selected inbox and reconciles the same recipient',async()=>{
 const calls=[];let event;
 const adapter=new LiveAdapters(env,{fetcher:async(_,o)=>{const r=JSON.parse(o.body);calls.push(r);if(r.method==='POST'){event=r.body;return {ok:true,status:200,json:async()=>({status:409,body:{}})};}return response({...event,status:'confirmed'});}});
 const result=await adapter.effect('CALENDAR_BOOK','routing-fixture',{email:'lead@example.net',start:'2026-10-12T10:00:00.000Z',end:'2026-10-12T10:30:00.000Z',recipient:inbox});
 assert.equal(result.attendees[0].email,inbox);assert.equal(calls.length,2);
 await assert.rejects(adapter.effect('CALENDAR_BOOK','denied-real',{email:'someone@fixture.test'}),/TEST_RECIPIENT_REQUIRES_SYNTHETIC_LEAD/);
 await assert.rejects(adapter.effect('EMAIL_SEND','changed-recipient',{email:'lead@example.net',recipient:'old@fixture.test'}),/DELIVERY_RECIPIENT_CHANGED/);
 assert.equal(calls.length,2);
 const missing=new LiveAdapters({...env,GMAIL_TEST_RECIPIENT:''},{fetcher:()=>{throw Error('NO_NETWORK_EXPECTED');}});
 await assert.rejects(missing.effect('CALENDAR_BOOK','missing',{email:'lead@example.net'}),/MISSING_GMAIL_TEST_RECIPIENT/);
});
test('synthetic gateway pins delivery to the registered hash without permitting personal CRM data',()=>{
 const options={testRecipientHash:identityHash(inbox),hash:identityHash};
 const calendar=email=>({service:'calendar',method:'POST',url:'https://www.googleapis.com/calendar/v3/calendars/primary/events',body:{attendees:[{email}]}});
 assert.equal(assertSyntheticConnector(calendar(inbox),options).body.attendees[0].email,inbox);
 assert.throws(()=>assertSyntheticConnector(calendar('other@example.net'),options),/CONNECTOR_TEST_RECIPIENT_DENIED/);
 assert.throws(()=>assertSyntheticConnector(calendar(inbox)),/CONNECTOR_SYNTHETIC_ONLY/);
 assert.throws(()=>assertSyntheticConnector({service:'hubspot',method:'POST',body:{properties:{email:inbox}}},options),/CONNECTOR_SYNTHETIC_ONLY/);
 const state={};runtimeSession({operation:'register',session_id:'00000000-0000-4000-8000-000000000000',endpoint:'https://fixture.trycloudflare.com',data_mode:'synthetic',test_recipient_hash:identityHash(inbox)},state,1000);
 assert.equal(state.session.test_recipient_hash,identityHash(inbox));assert.ok(!JSON.stringify(state).includes(inbox));
 assert.throws(()=>runtimeSession({operation:'register',data_mode:'synthetic',endpoint:'https://fixture.trycloudflare.com',test_recipient_hash:'bad'},{}),/SESSION_TEST_RECIPIENT_INVALID/);
});
test('changing the delivery inbox invalidates an earlier email approval and shows the new recipient',async()=>{
 const db=await openDb({url:null,dir:'memory://'});try{
 await migrate(db);const adapters=new MockAdapters(db);let target=inbox;adapters.deliveryRecipient=()=>target;
 const app=new RevFlow(db,adapters),seed=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url),'utf8'))[0];
 let ctx=await app.pipeline({...seed,source_event_id:'recipient-review',email:'recipient-review@example.net'});
 assert.equal((await app.review(ctx.approval_id)).recipient,inbox);await app.approve(ctx.approval_id,'approved','fixture-owner');
 target='new-inbox@fixture.test';ctx=await app.send(ctx);assert.ok(ctx.awaiting_approval);
 assert.equal((await app.review(ctx.approval_id)).recipient,target);assert.equal((await one(db,"SELECT count(*)::int n FROM actions WHERE kind='EMAIL_SEND'")).n,0);
 }finally{await db.close();}
});
