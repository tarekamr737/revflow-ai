import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openDb,one} from '../src/db.mjs';
const db=await openDb();const base='http://127.0.0.1:3100';
async function api(path,body,approver=false){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env[approver?'APPROVAL_TOKEN':'API_TOKEN']}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();assert.ok(r.ok,d.error||'OWNER_REQUEST_FAILED');return d;}
async function until(read,check,label){for(let i=0;i<60;i++){const v=await read();if(check(v))return v;await new Promise(r=>setTimeout(r,2000));}throw Error('CONNECTED_TIMEOUT_'+label);}
try{
 assert.equal(process.env.ADAPTER_MODE,'live');assert.equal(process.env.DATA_MODE,'synthetic');
 const ctx=await api('/api/demo',{});assert.ok(ctx.queued);
 console.log(JSON.stringify({step:'submitted',event_id:ctx.event_id,correlation_id:ctx.correlation_id}));
 const email=await until(()=>one(db,"SELECT id FROM approval_requests WHERE lead_id=$1 AND action_key LIKE 'SEND_INITIAL_EMAIL:%' AND decision='pending'",[ctx.lead_id||null]).then(async row=>row||one(db,"SELECT a.id FROM approval_requests a JOIN raw_events r ON r.lead_id=a.lead_id WHERE r.id=$1 AND a.action_key LIKE 'SEND_INITIAL_EMAIL:%' AND a.decision='pending'",[ctx.event_id])),Boolean,'EMAIL_APPROVAL');
 let p=await api('/api/events/'+ctx.event_id);ctx.lead_id=p.lead_id;assert.equal(p.route,'HOT');
 await api('/approvals/'+email.id,{decision:'approved'},true);await api('/approvals/'+email.id+'/execute',{},true);
 await until(()=>api('/api/events/'+ctx.event_id),p=>p.status==='CONTACTED','EMAIL_SENT');
 const duplicateSend=await api('/stages/send',{lead_id:ctx.lead_id,correlation_id:ctx.correlation_id});assert.ok(duplicateSend.sent);
 console.log(JSON.stringify({step:'email_sent',duplicate_suppressed:true}));
 await api('/api/demo/reply',{lead_id:ctx.lead_id});
 p=await until(()=>api('/api/events/'+ctx.event_id),p=>p.status==='MEETING_PROPOSED'&&p.slots.length>0,'REPLY');
 const slot=p.slots[0];await api('/api/meeting/select',{lead_id:ctx.lead_id,start:slot.start_at,end:slot.end_at});
 const booking=await until(()=>one(db,"SELECT id FROM approval_requests WHERE lead_id=$1 AND action_key LIKE 'BOOK_MEETING:%' AND decision='pending'",[ctx.lead_id]),Boolean,'BOOKING_APPROVAL');
 await api('/approvals/'+booking.id,{decision:'approved'},true);await api('/approvals/'+booking.id+'/execute',{},true);
 p=await until(()=>api('/api/events/'+ctx.event_id),p=>p.status==='MEETING_BOOKED','BOOKED');
 const duplicateBooking=await api('/stages/meeting',{lead_id:ctx.lead_id,correlation_id:ctx.correlation_id,start:slot.start_at,end:slot.end_at,operation:'book'});assert.ok(duplicateBooking.booked);
 const counts=await one(db,"SELECT count(*) FILTER(WHERE kind='EMAIL_SEND' AND status='completed')::int AS emails,count(*) FILTER(WHERE kind='CALENDAR_BOOK' AND status='completed')::int AS bookings,count(*) FILTER(WHERE status='completed' AND result->>'mock'='true')::int AS mock_receipts FROM actions WHERE lead_id=$1",[ctx.lead_id]);assert.equal(counts.emails,1);assert.equal(counts.bookings,1);assert.equal(counts.mock_receipts,0);
 const audits=await one(db,"SELECT count(*)::int AS missing FROM actions a WHERE a.lead_id=$1 AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM lead_events e WHERE e.lead_id=a.lead_id AND e.event_type='ACTION_COMPLETED' AND e.payload->>'action_key'=a.action_key)",[ctx.lead_id]);assert.equal(audits.missing,0);
 const ai=await one(db,'SELECT count(*)::int AS runs,bool_and(success) AS all_successful FROM ai_runs WHERE lead_id=$1',[ctx.lead_id]);assert.ok(ai.all_successful);
 const crm=await one(db,"SELECT status FROM crm_sync WHERE lead_id=$1",[ctx.lead_id]);assert.equal(crm.status,'synced');
 const result={tested_at:new Date().toISOString(),mode:'connected synthetic',event_id:ctx.event_id,lead_id:ctx.lead_id,correlation_id:ctx.correlation_id,lead_status:p.status,crm_synced:true,approval_ids:[email.id,booking.id],...counts,missing_action_audits:audits.missing,ai_runs:ai.runs,all_ai_successful:ai.all_successful,duplicate_send_suppressed:true,duplicate_booking_suppressed:true};
 if(process.env.EVIDENCE_PATH)await writeFile(process.env.EVIDENCE_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.close();}
