import assert from 'node:assert/strict';
import {openDb,one} from '../src/db.mjs';
const id=process.argv[2];assert.match(id||'',/^[a-f0-9-]{36}$/);
assert.ok(process.env.GMAIL_TEST_RECIPIENT&&process.env.GMAIL_TEST_RECIPIENT===process.env.GMAIL_SENDER,'Self-addressed test email configuration required');
const db=await openDb();
try{
 const lead=await one(db,'SELECT source_event_id,email FROM leads WHERE id=$1',[id]);
 assert.ok(lead?.source_event_id.startsWith('cloud-live-')&&/^[^\s@]+@example\.(com|net|org)$/.test(lead.email),'Only named synthetic integration fixtures may be approved');
 const requests=(await db.query("SELECT id FROM approval_requests WHERE lead_id=$1 AND decision='pending' AND expires_at>now()",[id])).rows;
 const headers={Authorization:`Bearer ${process.env.APPROVAL_TOKEN}`,'Content-Type':'application/json'};
 for(const request of requests){const url='http://localhost:3100/approvals/'+request.id;assert.equal((await fetch(url,{headers})).status,200);assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({decision:'approved'})})).status,200);}
 console.log(JSON.stringify({synthetic_fixture_approvals:requests.length}));
}finally{await db.close();}
