import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {retryPlan,redact} from './rules.mjs';
import {qualificationSchema,draftSchema,replySchema} from './schemas.mjs';
import {connectorPolicy} from './connector-policy.mjs';
import {assertSyntheticConnector} from './synthetic-connector.mjs';
import {identityHash,validatePersonalConfig,gatewayPersonalConfig,assertPersonalConnector,assertPersonalAiInput} from './personal-policy.mjs';
export class ProviderError extends Error {constructor(code,status=0,ambiguous=false){super(code);this.code=code;this.status=status;this.ambiguous=ambiguous;}}
export async function request(url,{method='GET',token,body,unsafe=false,fetcher=fetch,timeoutMs=15000,maxAttempts=4,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;;attempt++){
  try{const r=await fetcher(url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
   if(!r.ok)throw new ProviderError(`HTTP_${r.status}`,r.status,unsafe&&r.status>=500);
   return r.status===204?{}:await r.json();
  }catch(e){const error=e instanceof ProviderError?e:new ProviderError('NETWORK_ERROR',0,unsafe);const p=retryPlan({status:error.status,attempt,unsafe,ambiguous:error.ambiguous});if(!p.retry||attempt+1>=maxAttempts)throw error;await sleep(p.delay_ms);}
 }
}
export function mockSignals(lead,version='qualification-v1'){
 const t=lead.message.toLowerCase();
 let intent=/spam|lottery|crypto giveaway/.test(t)?'spam':/support|broken|password|refund/.test(t)?'support':/job|resume|hiring|career/.test(t)?'job':/student|school|assignment|thesis/.test(t)?'student':/partner|reseller/.test(t)?'partnership':/buy|purchase|contract/.test(t)?'purchase':/demo|discovery/.test(t)?'demo':/pricing|price|quote/.test(t)?'pricing':'unknown';
 if(version==='qualification-v2'&&/how much|cost estimate/.test(t))intent='pricing';
 const injection=/ignore.*instructions|system prompt|reveal.*secret|act as|override.*policy/i.test(t);
 return {intent,needs:/lead|sales|automation/.test(t)?['lead automation']:[],pain_points:[],buyer_role:lead.job_title||'unknown',urgency:/this month|today|urgent|immediately/.test(t)?'immediate':/quarter/.test(t)?'quarter':'unknown',budget_signal:/approved budget/.test(t)?'approved':'unknown',authority_signal:/own.*decision|decision maker/.test(t)?'decision_maker':/manager/.test(lead.job_title.toLowerCase())?'influencer':'unknown',purchase_intent:['purchase','demo'].includes(intent)?'high':intent==='pricing'?'medium':'low',timeline:/this month/.test(t)?'this month':'unknown',sentiment:'neutral',risk_flags:injection?['prompt_injection']:[],recommended_next_action:intent==='unknown'||injection?'review':['demo','purchase','pricing'].includes(intent)?'discovery':'reject',confidence:injection?0.4:intent==='unknown'?0.45:0.95,evidence:[redact(lead.message).slice(0,140)]};
}
export class MockAdapters {
 mode='mock'; constructor(db){this.db=db;this.failures=[];this.busy=[];}
 async ai(task,input,version){let output;if(task==='qualification')output=mockSignals(input,version);else if(task==='outreach'){const k=input.knowledge;output={subject:`A discovery conversation about ${k.product}`,body:k.claims[0].text+' '+k.cta,cta:k.cta,claim_ids:[k.claims[0].id]};}else {const t=input.message.toLowerCase();output={intent:/unsubscribe|stop|opt.out/.test(t)?'unsubscribe':/meeting|book|schedule|slot/.test(t)?'meeting':/\?/.test(t)?'question':'unknown',confidence:/meeting|book|schedule|slot|unsubscribe|stop|opt.out|\?/.test(t)?0.95:0.4,tool:/meeting|book|schedule|slot/.test(t)?'read_calendar':'none'};}
  return {output,model:'deterministic-fixture-adapter',input_tokens:0,output_tokens:0,cost_usd:0};
 }
 async effect(kind,key,payload){if(this.failures.length)throw this.failures.shift();const id=createHash('sha256').update(key).digest('hex').slice(0,24);const result={id,kind,mock:true,...(kind==='EMAIL_SEND'?{threadId:id}:{})};await this.db.query('INSERT INTO mock_effects(action_key,kind,result) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[key,kind,result]);return result;}
 async available(start,end){return !this.busy.some(b=>Date.parse(start)<Date.parse(b.end)&&Date.parse(end)>Date.parse(b.start));}
}
export class LiveAdapters {
 mode='live';constructor(env=process.env,{fetcher=fetch,personalConfig=null}={}){this.env=env;this.fetcher=fetcher;this.dataMode=env.DATA_MODE||'synthetic';if(!['synthetic','personal'].includes(this.dataMode))throw new ProviderError('DATA_MODE_INVALID',400);this.personalConfig=this.dataMode==='personal'?validatePersonalConfig(personalConfig):null;this.gatewayConfig=this.personalConfig?gatewayPersonalConfig(this.personalConfig):null;if(this.dataMode==='personal'&&env.GMAIL_TEST_RECIPIENT)throw new ProviderError('PERSONAL_TEST_OVERRIDE_DENIED',400);}
 deliveryRecipient(email){if(this.dataMode==='personal')return email;if(!/^[^\s@]+@example\.(com|net|org)$/.test(email||''))throw new ProviderError('TEST_RECIPIENT_REQUIRES_SYNTHETIC_LEAD',400);const recipient=this.need('GMAIL_TEST_RECIPIENT').trim().toLowerCase();if(!/^[^\s<>@]+@[^\s<>@]+$/.test(recipient))throw new ProviderError('TEST_RECIPIENT_INVALID',400);return recipient;}
 need(name){const value=this.env[name];if(!value)throw new ProviderError(`MISSING_${name}`,400);return value;}
 providerToken(name){return this.env.CONNECTOR_GATEWAY_URL?undefined:this.need(name);}
 async providerRequest(url,{method='GET',body,unsafe=false,token}={}){
  if(!this.env.CONNECTOR_GATEWAY_URL)throw new ProviderError('CONNECTED_N8N_GATEWAY_REQUIRED',400);
  const gateway=this.env.CONNECTOR_GATEWAY_URL;if(!gateway.startsWith('https://'))throw new ProviderError('CONNECTOR_GATEWAY_HTTPS_REQUIRED',400);
  let checked;try{const request=connectorPolicy({url,method,body});checked=this.dataMode==='personal'?assertPersonalConnector(request,this.gatewayConfig,identityHash):assertSyntheticConnector(request,{testRecipientHash:this.env.GMAIL_TEST_RECIPIENT?identityHash(this.env.GMAIL_TEST_RECIPIENT):undefined,hash:identityHash});}catch{throw new ProviderError(this.dataMode==='personal'?'PERSONAL_CONNECTOR_DENIED':'CONNECTOR_SYNTHETIC_ONLY',400);}
  const r=await request(gateway,{method:'POST',token:this.need('N8N_GATEWAY_TOKEN'),body:checked,unsafe,fetcher:this.fetcher});
  if(!Number.isInteger(r.status)||r.status<100||r.status>599)throw new ProviderError('CONNECTOR_ENVELOPE_REJECTED',502,unsafe);
  if(r.status<200||r.status>=300)throw new ProviderError(`HTTP_${r.status}`,r.status,unsafe&&r.status>=500);
  return r.body||{};
 }
 async ai(task,input,version){if(this.dataMode==='personal')assertPersonalAiInput(task,input);const schemas={qualification:qualificationSchema,outreach:draftSchema,reply:replySchema};const prompt=await readFile(new URL(`../prompts/${version}.txt`,import.meta.url),'utf8');const url=this.need('AI_GATEWAY_URL');if(!url.startsWith('https://'))throw new ProviderError('AI_GATEWAY_HTTPS_REQUIRED',400);return request(url,{method:'POST',token:this.need('AI_GATEWAY_TOKEN'),body:{task,prompt_version:version,prompt,schema:schemas[task],untrusted_data:input},fetcher:this.fetcher,timeoutMs:50000,maxAttempts:1});}
 async hub(path,method='GET',body,unsafe=false){return this.providerRequest('https://api.hubapi.com'+path,{method,body,unsafe,token:this.providerToken('HUBSPOT_ACCESS_TOKEN')});}
 async enrich(lead){
  if(!lead.company_domain)return null;
  const response=await this.hub('/crm/v3/objects/companies/search','POST',{filterGroups:[{filters:[{propertyName:'domain',operator:'EQ',value:lead.company_domain}]}],limit:2});
  if(response.results?.length>1)throw new ProviderError('ENRICHMENT_AMBIGUOUS_MATCH',409);
  const company=response.results?.[0];if(!company)return null;
  if(company.properties?.domain?.toLowerCase()!==lead.company_domain||typeof company.properties?.name!=='string'||!company.properties.name.trim()||!/^\d+$/.test(company.id))throw new ProviderError('ENRICHMENT_UNVERIFIED_RESPONSE',422);
  return {data:{domain:company.properties.domain.toLowerCase(),company_name:company.properties.name.slice(0,300),provider_id:company.id,verified:true},provenance:'hubspot_company_api',confidence:0.8};
 }
 async currentCompany(domain){const found=await this.hub('/crm/v3/objects/companies/search','POST',{filterGroups:[{filters:[{propertyName:'domain',operator:'EQ',value:domain}]}],limit:2});if(found.results?.length>1)throw new ProviderError('CRM_AMBIGUOUS_MATCH',409);const row=found.results?.[0];if(row&&(!/^\d+$/.test(row.id)||row.properties?.domain?.toLowerCase()!==domain))throw new ProviderError('CRM_COMPANY_UNVERIFIED',422);return row||null;}
 async upsert(type,property,value,properties,associations){const found=await this.hub(`/crm/v3/objects/${type}/search`,'POST',{filterGroups:[{filters:[{propertyName:property,operator:'EQ',value}]}],limit:2});if(found.results?.length>1)throw new ProviderError('CRM_AMBIGUOUS_MATCH',409);const row=found.results?.[0];return row?this.hub(`/crm/v3/objects/${type}/${row.id}`,'PATCH',{properties}):this.hub(`/crm/v3/objects/${type}`,'POST',{properties,...(associations?.length?{associations}:{})},true);}
 async effect(kind,key,p){
  if(kind==='CRM_CONTACT')return this.upsert('contacts','email',p.email,{email:p.email,firstname:p.name,jobtitle:p.job_title},p.company_id?[{to:{id:p.company_id},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:1}]}]:undefined);
  if(kind==='CRM_COMPANY')return this.upsert('companies','domain',p.company_domain,{domain:p.company_domain,name:p.company_name});
  if(kind==='CRM_ASSOCIATE')return this.hub(`/crm/v4/objects/contacts/${encodeURIComponent(p.contact_id)}/associations/default/companies/${encodeURIComponent(p.company_id)}`,'PUT',{});
  if(kind==='CRM_DEAL'){
   const associated=await this.hub(`/crm/v4/objects/contacts/${encodeURIComponent(p.contact_id)}/associations/deals?limit=500`);
   if(associated.paging?.next)throw new ProviderError('CRM_ASSOCIATIONS_REQUIRE_REVIEW',409);
   const deals=await Promise.all((associated.results||[]).map(a=>this.hub(`/crm/v3/objects/deals/${a.toObjectId}?properties=hs_is_closed`)));
   const open=deals.filter(d=>d.properties?.hs_is_closed==='false');if(open.length>1)throw new ProviderError('MULTIPLE_OPEN_DEALS',409);if(open.length)return this.hub(`/crm/v3/objects/deals/${open[0].id}`,'PATCH',{properties:{description:this.dataMode==='personal'?'RevFlow qualification updated':'RevFlow synthetic test'}});
   return this.hub('/crm/v3/objects/deals','POST',{properties:{dealname:'RevFlow discovery',pipeline:this.need('HUBSPOT_PIPELINE'),dealstage:this.need('HUBSPOT_DEAL_STAGE')},associations:[{to:{id:p.contact_id},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:3}]}]},true);
  }
  if(kind==='EMAIL_SEND'){
   const sender=this.need('GMAIL_SENDER'),recipient=this.deliveryRecipient(p.email);if(p.recipient&&p.recipient!==recipient)throw new ProviderError('DELIVERY_RECIPIENT_CHANGED',400);if(/[\r\n]/.test(sender+recipient+p.subject))throw new ProviderError('HEADER_INJECTION',400);
   const messageId=createHash('sha256').update(key).digest('hex');const raw=Buffer.from(`From: ${sender}\r\nTo: ${recipient}\r\nSubject: ${p.subject}\r\nMessage-ID: <${messageId}@revflow.local>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(p.body).toString('base64')}`).toString('base64url');
   return this.providerRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',token:this.providerToken('GOOGLE_ACCESS_TOKEN'),body:{raw},unsafe:true});
  }
  if(kind==='CALENDAR_BOOK'){
   const recipient=this.deliveryRecipient(p.email);if(p.recipient&&p.recipient!==recipient)throw new ProviderError('DELIVERY_RECIPIENT_CHANGED',400);
   const id=createHash('sha256').update(key).digest('hex'),url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.env.GOOGLE_CALENDAR_ID||'primary')}/events`;
   try{return await this.providerRequest(url,{method:'POST',token:this.providerToken('GOOGLE_ACCESS_TOKEN'),body:{id,summary:'Discovery conversation',start:{dateTime:p.start},end:{dateTime:p.end},attendees:[{email:recipient}]}});}catch(e){if(e.status!==409)throw e;const existing=await this.providerRequest(url+'/'+id,{token:this.providerToken('GOOGLE_ACCESS_TOKEN')});if(existing.id!==id||existing.status==='cancelled'||Date.parse(existing.start?.dateTime)!==Date.parse(p.start)||Date.parse(existing.end?.dateTime)!==Date.parse(p.end)||!existing.attendees?.some(a=>a.email.toLowerCase()===recipient))throw new ProviderError('CALENDAR_CONFLICT_REQUIRES_REVIEW',409);return existing;}
  }
  if(kind==='CRM_NOTE')return this.hub('/crm/v3/objects/notes','POST',{properties:{hs_timestamp:new Date().toISOString(),hs_note_body:p.note},associations:[{to:{id:p.contact_id},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:202}]}]},true);
  if(kind==='CRM_TASK'){
   const labels=await this.hub('/crm/v4/associations/tasks/contacts/labels');const types=(labels.results||[]).filter(x=>x.category==='HUBSPOT_DEFINED'&&x.label===null&&Number.isInteger(x.typeId));if(types.length!==1)throw new ProviderError('CRM_TASK_ASSOCIATION_UNKNOWN',409);
   return this.hub('/crm/v3/objects/tasks','POST',{properties:{hs_timestamp:new Date().toISOString(),hs_task_subject:this.dataMode==='personal'?'RevFlow representative review':'RevFlow synthetic test',hs_task_body:p.note,hs_task_status:'NOT_STARTED',hs_task_priority:'MEDIUM'},associations:[{to:{id:p.contact_id},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:types[0].typeId}]}]},true);
  }
  if(kind==='ALERT')return this.providerRequest('https://slack.com/api/chat.postMessage',{method:'POST',token:this.providerToken('SLACK_BOT_TOKEN'),body:{channel:this.need('SLACK_CHANNEL'),text:`RevFlow ${p.code}. Correlation: ${p.correlation_id}`},unsafe:true}).then(r=>{if(!r.ok)throw new ProviderError('SLACK_REJECTED',400);return r;});
  throw new ProviderError('UNSUPPORTED_EFFECT',400);
 }
 async available(start,end){const id=this.env.GOOGLE_CALENDAR_ID||'primary';const r=await this.providerRequest('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',token:this.providerToken('GOOGLE_ACCESS_TOKEN'),body:{timeMin:start,timeMax:end,items:[{id}]}});const c=r.calendars?.[id];if(!c||c.errors?.length)throw new ProviderError('AVAILABILITY_UNKNOWN',502);return c.busy.length===0;}
}
