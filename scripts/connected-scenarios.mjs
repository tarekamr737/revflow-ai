import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openDb,one} from '../src/db.mjs';
const db=await openDb(),base='http://127.0.0.1:3100';
async function api(path,body,approval=false){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env[approval?'APPROVAL_TOKEN':'API_TOKEN']}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert.ok(r.ok,result.error);return result;}
async function until(fn,check,label){for(let i=0;i<80;i++){const r=await fn();if(check(r))return r;await new Promise(resolve=>setTimeout(resolve,1500));}throw Error('SCENARIO_TIMEOUT_'+label);}
async function approve(ctx,prefix){const row=await until(()=>one(db,"SELECT id FROM approval_requests WHERE lead_id=$1 AND action_key LIKE $2 AND decision='pending'",[ctx.lead_id,prefix+'%']),Boolean,'APPROVAL');await api('/approvals/'+row.id,{decision:'approved'},true);await api('/approvals/'+row.id+'/execute',{},true);return row.id;}
const evidence=[];
try{
 assert.equal(process.env.ADAPTER_MODE,'live');assert.equal(process.env.DATA_MODE,'synthetic');assert.ok(process.env.GMAIL_TEST_RECIPIENT);
 for(const scenario of ['meeting','question','unsubscribe']){
  const resumed=scenario==='meeting'&&process.env.RESUME_MEETING_LEAD;
  const ctx=resumed?await one(db,'SELECT id AS event_id,lead_id,correlation_id FROM raw_events WHERE lead_id=$1',[resumed]):await api('/api/workflows/start',{scenario});
  const progress=()=>api('/api/events/'+ctx.event_id);
  let p=await until(progress,p=>p.lead_id&&(resumed||p.status==='QUALIFIED'),'QUALIFIED');ctx.lead_id=p.lead_id;
  console.log(JSON.stringify({scenario,step:'qualified',lead_id:ctx.lead_id}));
  const emailApproval=resumed?(await one(db,"SELECT id FROM approval_requests WHERE lead_id=$1 AND action_key LIKE 'SEND_INITIAL_EMAIL:%' AND decision='consumed'",[ctx.lead_id])).id:await approve(ctx,'SEND_INITIAL_EMAIL:');
  if(resumed){
   assert.ok(['RESPONDED','MEETING_PROPOSED'].includes(p.status));
   if(p.status==='RESPONDED'){const response=await fetch(process.env.N8N_REPLY_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.N8N_INBOUND_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({lead_id:ctx.lead_id,correlation_id:ctx.correlation_id,message:'Can we schedule a meeting?',provider_id:'scenario-meeting-recovery-'+ctx.lead_id}),signal:AbortSignal.timeout(15000)});assert.ok(response.ok);}
  }else{await until(progress,p=>p.status==='CONTACTED','CONTACTED');await api('/api/replies/sample',{lead_id:ctx.lead_id});}
  let bookingApproval=null;
  if(scenario==='meeting'){
   p=await until(progress,p=>p.status==='MEETING_PROPOSED'&&p.slots.length,'MEETING_PROPOSED');const slot=p.slots[0];
   await api('/api/meeting/select',{lead_id:ctx.lead_id,start:slot.start_at,end:slot.end_at});bookingApproval=await approve(ctx,'BOOK_MEETING:');
   await until(progress,p=>p.status==='MEETING_BOOKED','MEETING_BOOKED');
  }else if(scenario==='question')await until(()=>one(db,"SELECT id FROM actions WHERE lead_id=$1 AND kind='CRM_TASK' AND status='completed'",[ctx.lead_id]),Boolean,'CRM_TASK');
  else await until(progress,p=>p.opted_out===true,'OPTED_OUT');
  const alert=scenario==='meeting'?'MEETING_BOOKED':scenario==='question'?'REPLY_REVIEW_REQUESTED':'OPTED_OUT';
  await until(()=>one(db,"SELECT id FROM actions WHERE lead_id=$1 AND kind='ALERT' AND payload->>'code'=$2 AND status='completed'",[ctx.lead_id,alert]),Boolean,'SLACK');
  p=await progress();
  const counts=await one(db,"SELECT count(*) FILTER (WHERE kind='EMAIL_SEND' AND status='completed')::int emails,count(*) FILTER (WHERE kind='CALENDAR_BOOK' AND status='completed')::int bookings,count(*) FILTER (WHERE kind='CRM_TASK' AND status='completed')::int crm_tasks,count(*) FILTER (WHERE kind='ALERT' AND status='completed')::int slack_alerts,count(*) FILTER (WHERE status='completed' AND result->>'mock'='true')::int mock_receipts FROM actions WHERE lead_id=$1",[ctx.lead_id]);
  assert.equal(counts.emails,1);assert.equal(counts.bookings,scenario==='meeting'?1:0);assert.equal(counts.crm_tasks,scenario==='question'?1:0);assert.equal(counts.mock_receipts,0);
  const crm=await one(db,'SELECT contact_id,company_id,deal_id,status FROM crm_sync WHERE lead_id=$1',[ctx.lead_id]);assert.equal(crm.status,'synced');
  const lead=await one(db,'SELECT consent,opted_out,next_follow_up_at FROM leads WHERE id=$1',[ctx.lead_id]);
  if(scenario==='unsubscribe'){assert.equal(lead.consent,false);assert.equal(lead.next_follow_up_at,null);}
  const missing=await one(db,"SELECT count(*)::int n FROM actions a WHERE a.lead_id=$1 AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM lead_events e WHERE e.lead_id=a.lead_id AND e.event_type='ACTION_COMPLETED' AND e.payload->>'action_key'=a.action_key)",[ctx.lead_id]);assert.equal(missing.n,0);
  evidence.push({scenario,event_id:ctx.event_id,lead_id:ctx.lead_id,correlation_id:ctx.correlation_id,status:p.status,opted_out:!!lead.opted_out,email_approval:emailApproval,booking_approval:bookingApproval,crm,slack_event:alert,...counts,missing_action_audits:missing.n});
  console.log(JSON.stringify({scenario,step:'verified',status:p.status,...counts}));
  if(process.env.EVIDENCE_PATH)await writeFile(process.env.EVIDENCE_PATH,JSON.stringify({tested_at:new Date().toISOString(),mode:'connected synthetic',recipient_configured:true,scenarios:evidence},null,2)+'\n');
 }
}finally{await db.close();}
