// Connected-account testing is limited to fixed fixture content and operational IDs.
export function assertSyntheticConnector(request,{testRecipientHash,hash}={}){
 const calendarEvent=request.service==='calendar'&&request.method==='POST'&&/\/events$/.test(request.url||'');
 const selectedRecipient=v=>typeof v==='string'&&/^[^\s<>@]+@[^\s<>@]+$/.test(v)&&testRecipientHash&&typeof hash==='function'&&hash(v.trim().toLowerCase())===testRecipientHash;
 const known=new Set(['email','domain','EQ','false','primary','Synthetic CTO','Example Labs','Example Operations','Synthetic Company','CTO','Manager','RevFlow discovery','RevFlow synthetic test','appointmentscheduled','default','HUBSPOT_DEFINED','Prospect replied; representative review requested.','Discovery meeting booked.','NOT_STARTED','MEDIUM','Discovery conversation']);
 const keys=new Set(['filterGroups','filters','propertyName','operator','value','limit','properties','email','firstname','jobtitle','domain','name','dealname','pipeline','dealstage','description','associations','to','id','types','associationCategory','associationTypeId','hs_timestamp','hs_note_body','hs_task_subject','hs_task_body','hs_task_status','hs_task_priority','raw','summary','start','end','dateTime','attendees','timeMin','timeMax','items','channel','text']);
 const syntheticEmail=v=>/^[^\s@]+@example\.(com|net|org)$/.test(v);
 const approvedBodies=['RevFlow AI helps teams organize inbound leads and route sales follow-up.','Sensitive outreach is reviewed by a person before sending.'];
 const cta='Would a short discovery conversation be useful?';
 const allowedBody=v=>[...approvedBodies,approvedBodies.join(' ')].some(t=>v===t+' '+cta);
 const walk=(v,k='')=>{if(Array.isArray(v))return v.forEach(x=>walk(x,k));if(v&&typeof v==='object'){for(const [field,item]of Object.entries(v)){if(!keys.has(field))throw Error('CONNECTOR_SYNTHETIC_ONLY');walk(item,field);}return;}if(v===undefined||v===null)return;if(typeof v==='number'){if(!Number.isInteger(v)||v<0||v>500)throw Error('CONNECTOR_SYNTHETIC_ONLY');return;}if(typeof v!=='string')throw Error('CONNECTOR_SYNTHETIC_ONLY');
  if(k==='raw'){
   if(typeof Buffer==='undefined'||!/^[A-Za-z0-9_-]+$/.test(v))throw Error('CONNECTOR_SYNTHETIC_ONLY');
   const mime=Buffer.from(v,'base64url').toString('utf8'),[headers,body,...extra]=mime.split('\r\n\r\n');
   const lines=headers.split('\r\n');
   if(testRecipientHash&&!selectedRecipient(lines[1]?.slice(4)))throw Error('CONNECTOR_TEST_RECIPIENT_DENIED');
   if(extra.length||lines.length!==7||!/^From: [^\s<>@]+@[^\s<>@]+$/.test(lines[0])||!/^To: [^\s<>@]+@[^\s<>@]+$/.test(lines[1])||lines[2]!=='Subject: A discovery conversation about RevFlow AI'||!/^Message-ID: <[a-f0-9]{64}@revflow.local>$/.test(lines[3])||lines[4]!=='MIME-Version: 1.0'||lines[5]!=='Content-Type: text/plain; charset=UTF-8'||lines[6]!=='Content-Transfer-Encoding: base64'||!allowedBody(Buffer.from(body||'','base64').toString('utf8')))throw Error('CONNECTOR_SYNTHETIC_ONLY');return;
  }
  if(k==='email'&&calendarEvent&&testRecipientHash){if(!selectedRecipient(v))throw Error('CONNECTOR_TEST_RECIPIENT_DENIED');return;}
  if(k==='text'&&/^RevFlow (?:APPROVAL_REQUESTED|MEETING_BOOKED|MEETING_REMINDER|DEAD_LETTER|REPLY_REVIEW_REQUESTED|OPTED_OUT)\. Correlation: [a-f0-9-]{36}$/.test(v))return;
  if(known.has(v)||v===''||syntheticEmail(v)||/^example\.(com|net|org)$/.test(v)||(/^(?:id|value)$/.test(k)&&/^\d+$/.test(v))||/^(?:id)$/.test(k)&&/^[a-f0-9]{64}$/.test(v)||/^(?:dateTime|timeMin|timeMax|hs_timestamp)$/.test(k)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)||k==='channel'&&v==='C0C6V1LKAMN')return;
  throw Error('CONNECTOR_SYNTHETIC_ONLY');
 };
 walk(request.body||{});return request;
}
