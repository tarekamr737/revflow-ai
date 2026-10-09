import {createHash} from 'node:crypto';
export const identityHash=value=>createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

export function validateSalesKnowledge(k){
 if(k&&Object.keys(k).some(key=>!['version','approved','product','claims','allowed_urls','cta','pricing','disclaimer','always_require_approval'].includes(key)))throw Error('SALES_UNKNOWN_FIELD');
 if(!k||k.approved!==true||!/^sales-personal-[a-z0-9-]{1,60}$/.test(k.version||'')||typeof k.product!=='string'||!k.product.trim()||k.product.length>100||/[\r\n]/.test(k.product))throw Error('REVIEWED_SALES_KNOWLEDGE_REQUIRED');
 if(!Array.isArray(k.claims)||!k.claims.length||k.claims.length>12||new Set(k.claims.map(c=>c.id)).size!==k.claims.length||k.claims.some(c=>Object.keys(c).some(key=>!['id','text'].includes(key))||!/^[-a-z0-9]{1,60}$/.test(c.id||'')||typeof c.text!=='string'||!c.text.trim()||c.text.length>500||/[\r\n]/.test(c.text)))throw Error('SALES_CLAIMS_INVALID');
 if(typeof k.cta!=='string'||!k.cta.trim()||k.cta.length>500||/[\r\n]/.test(k.cta)||!Array.isArray(k.allowed_urls)||k.allowed_urls.some(u=>!/^https:\/\//.test(u))||k.pricing!==null)throw Error('SALES_POLICY_INVALID');
 if(/synthetic|demo.only|replace.*before live/i.test(k.disclaimer||''))throw Error('DEMO_KNOWLEDGE_NOT_PERSONAL');
 if(/Bearer\s+\S+|sk-[a-zA-Z0-9]{12}|xox[baprs]-/.test(JSON.stringify(k)))throw Error('SALES_SECRET_DENIED');
 return k;
}

export function validatePersonalConfig(c){
 if(!c||c.enabled!==true||c.model_data_acknowledged!==true)throw Error('PERSONAL_DATA_NOT_ENABLED');
 if(!Array.isArray(c.allowed_emails)||!c.allowed_emails.length||c.allowed_emails.length>50||c.allowed_emails.some(e=>typeof e!=='string'||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)))throw Error('PERSONAL_RECIPIENT_ALLOWLIST_REQUIRED');
 if(!Array.isArray(c.allowed_domains)||!c.allowed_domains.length||c.allowed_domains.some(d=>typeof d!=='string'||!/^[-a-z0-9]+(?:\.[-a-z0-9]+)+$/.test(d)))throw Error('PERSONAL_DOMAIN_ALLOWLIST_REQUIRED');
 if(!/^C[A-Z0-9]+$/.test(c.slack_channel||'')||!/^[-a-zA-Z0-9_]+$/.test(c.hubspot_pipeline||'')||!/^[-a-zA-Z0-9_]+$/.test(c.hubspot_deal_stage||'')||typeof c.calendar_id!=='string'||!c.calendar_id||c.calendar_id.length>200)throw Error('PERSONAL_ACCOUNT_ROUTING_REQUIRED');
 validateSalesKnowledge(c.knowledge);return c;
}

// Portable into n8n. Only the registered owner configuration selects this path.
export function assertPersonalAiInput(task,input){
 const fields={qualification:['message','job_title'],reply:['message'],outreach:['knowledge']}[task];
 if(!fields||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||fields.some(k=>!(k in input)))throw Error('PERSONAL_AI_INPUT_DENIED');
 if(task!=='outreach'&&Object.values(input).some(v=>typeof v!=='string'||v.length>8000||/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|Bearer\s+\S+|sk-[a-zA-Z0-9]{12}/.test(v)))throw Error('PERSONAL_AI_PII_DENIED');
 if(task==='outreach'){const k=input.knowledge;if(k?.approved!==true||!/^sales-personal-/.test(k.version||'')||!Array.isArray(k.claims)||k.claims.length>12||JSON.stringify(k).length>10000)throw Error('PERSONAL_AI_KNOWLEDGE_DENIED');}
 return input;
}

export function assertPersonalConnector(request,config,digest){
 if(!config?.email_hashes?.length||!config.domain_hashes?.length||!config.knowledge?.approved)throw Error('PERSONAL_CONFIGURATION_REQUIRED');
 const email=v=>typeof v==='string'&&config.email_hashes.includes(digest(v.trim().toLowerCase()));
 const domain=v=>typeof v==='string'&&config.domain_hashes.includes(digest(v.trim().toLowerCase()));
 const keys=new Set(['filterGroups','filters','propertyName','operator','value','limit','properties','email','firstname','jobtitle','domain','name','dealname','pipeline','dealstage','description','associations','to','id','types','associationCategory','associationTypeId','hs_timestamp','hs_note_body','hs_task_subject','hs_task_body','hs_task_status','hs_task_priority','raw','summary','start','end','dateTime','attendees','timeMin','timeMax','items','channel','text']);
 function walk(v,depth=0){if(depth>8)throw Error('PERSONAL_CONNECTOR_DENIED');if(Array.isArray(v)){if(v.length>50)throw Error('PERSONAL_CONNECTOR_DENIED');return v.forEach(x=>walk(x,depth+1));}if(v&&typeof v==='object'){for(const [k,x]of Object.entries(v)){if(!keys.has(k))throw Error('PERSONAL_CONNECTOR_DENIED');walk(x,depth+1);}return;}if(v===null||v===undefined)return;if(typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=500)return;if(typeof v!=='string'||v.length>16000||/Bearer\s+\S+|sk-[a-zA-Z0-9]{12}/.test(v))throw Error('PERSONAL_CONNECTOR_DENIED');}
 const b=request.body||{};walk(b);
 for(const group of b.filterGroups||[])for(const f of group.filters||[])if(f.operator!=='EQ'||!(['email','domain'].includes(f.propertyName))||!(f.propertyName==='email'?email(f.value):domain(f.value)))throw Error('PERSONAL_IDENTITY_DENIED');
 if(b.properties?.email&&!email(b.properties.email)||b.properties?.domain&&!domain(b.properties.domain))throw Error('PERSONAL_IDENTITY_DENIED');
 if(b.properties?.pipeline&&b.properties.pipeline!==config.pipeline||b.properties?.dealstage&&b.properties.dealstage!==config.deal_stage)throw Error('PERSONAL_ROUTING_DENIED');
 if(b.raw){
  const mime=Buffer.from(b.raw,'base64url').toString('utf8'),[headers,encoded,...extra]=mime.split('\r\n\r\n');const h=headers.split('\r\n');
  const body=Buffer.from(encoded||'','base64').toString('utf8'),k=config.knowledge;
  const approved=k.claims.filter(c=>body.includes(c.text));
  if(extra.length||h.length!==7||!/^From: [^\s<>@]+@[^\s<>@]+$/.test(h[0])||!email(h[1]?.slice(4))||h[2]!==`Subject: A discovery conversation about ${k.product}`||!/^Message-ID: <[a-f0-9]{64}@revflow.local>$/.test(h[3])||h[4]!=='MIME-Version: 1.0'||h[5]!=='Content-Type: text/plain; charset=UTF-8'||h[6]!=='Content-Transfer-Encoding: base64'||!approved.length||body!==approved.map(c=>c.text).join(' ')+' '+k.cta)throw Error('PERSONAL_EMAIL_DENIED');
 }
 if(b.attendees?.some(a=>!email(a.email)))throw Error('PERSONAL_RECIPIENT_DENIED');
 if(b.items?.some(i=>i.id!==config.calendar_id))throw Error('PERSONAL_ROUTING_DENIED');
 if(request.service==='calendar'&&request.url.includes('/calendars/')&&decodeURIComponent(request.url.split('/calendars/')[1].split('/')[0])!==config.calendar_id)throw Error('PERSONAL_ROUTING_DENIED');
 if(request.service==='slack'&&(b.channel!==config.slack_channel||!/^RevFlow (?:APPROVAL_REQUESTED|MEETING_BOOKED|MEETING_REMINDER|DEAD_LETTER)\. Correlation: [a-f0-9-]{36}$/.test(b.text||'')))throw Error('PERSONAL_ALERT_DENIED');
 return request;
}

export function gatewayPersonalConfig(c){validatePersonalConfig(c);return {email_hashes:c.allowed_emails.map(identityHash),domain_hashes:c.allowed_domains.map(identityHash),knowledge:c.knowledge,calendar_id:c.calendar_id,slack_channel:c.slack_channel,pipeline:c.hubspot_pipeline,deal_stage:c.hubspot_deal_stage};}
