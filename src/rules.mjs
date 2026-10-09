export const intents=['demo','pricing','purchase','support','partnership','job','student','spam','unknown'];
export function normalize(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_PAYLOAD');
 const text=(key,max=300)=>typeof input[key]==='string'?input[key].normalize('NFKC').trim().slice(0,max):'';
 const email=text('email',254).toLowerCase()||null;
 const phone=text('phone',40).replace(/[\s().-]/g,'')||null;
 const errors=[];
 if(!email&&!phone)errors.push('MISSING_CONTACT');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push('INVALID_EMAIL');
 if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))errors.push('INVALID_PHONE');
 if(!text('source',40)||!text('source_event_id',160))errors.push('MISSING_EVENT_ID');
 return {lead:{source:text('source',40),source_event_id:text('source_event_id',160),name:text('name'),email,phone,company_name:text('company_name'),company_domain:text('company_domain').toLowerCase().replace(/^https?:\/\//,'').split('/')[0]||email?.split('@')[1]||null,job_title:text('job_title'),country:text('country',2).toUpperCase(),message:text('message',8000),consent:input.consent===true},errors};
}
export function score(lead,signals,config){
 const b={fit:(lead.company_name?20:0)+(signals.authority_signal==='decision_maker'?20:signals.authority_signal==='influencer'?10:0),intent:({purchase:30,demo:30,pricing:25})[signals.intent]||0,urgency:({immediate:15,quarter:8,later:3,unknown:0})[signals.urgency]||0,engagement:lead.consent?15:0};
 for(const key of Object.keys(b))b[key]=Math.round(b[key]*config.weights[key]/({fit:40,intent:30,urgency:15,engagement:15})[key]);
 const value=Math.min(100,Object.values(b).reduce((a,v)=>a+v,0));
 let route=value>=config.thresholds.HOT?'HOT':value>=config.thresholds.WARM?'WARM':value>=config.thresholds.NURTURE?'NURTURE':'LOW';
 if(['support','job','student','partnership','spam'].includes(signals.intent))route='REJECT';
 else if(signals.confidence<config.minimum_confidence||signals.intent==='unknown'||signals.risk_flags.length)route='MANUAL_REVIEW';
 return {score:value,route,breakdown:b,config_version:config.version};
}
export const transitions={NEW:['QUALIFIED','NURTURE','MANUAL_REVIEW','DISQUALIFIED','SPAM'],QUALIFIED:['CONTACTED','MANUAL_REVIEW','DISQUALIFIED'],CONTACTED:['RESPONDED','MANUAL_REVIEW','DISQUALIFIED'],RESPONDED:['MEETING_PROPOSED','MANUAL_REVIEW','DISQUALIFIED'],MEETING_PROPOSED:['MEETING_BOOKED','MANUAL_REVIEW','DISQUALIFIED'],MEETING_BOOKED:['OPPORTUNITY','MANUAL_REVIEW'],OPPORTUNITY:['WON','LOST','MANUAL_REVIEW'],NURTURE:['QUALIFIED','MANUAL_REVIEW','DISQUALIFIED'],MANUAL_REVIEW:['QUALIFIED','NURTURE','DISQUALIFIED','SPAM'],DISQUALIFIED:[],SPAM:[],WON:[],LOST:[]};
export function transitionAllowed(from,to){return from===to||!!transitions[from]?.includes(to);}
export function retryPlan({status=0,attempt=0,unsafe=false,ambiguous=false}){const transient=status===429||status===408||status>=500||status===0;if(unsafe&&ambiguous)return {class:'uncertain',retry:false,delay_ms:null};return {class:transient?'transient':'permanent',retry:transient&&attempt<3,delay_ms:transient&&attempt<3?[5000,30000,120000][attempt]:null};}
export function outreachPolicy(lead,draft,knowledge,route){
 const reasons=[];
 if(!lead.consent||lead.opted_out)reasons.push('NO_CONSENT');
 if(!lead.email)reasons.push('NO_EMAIL');
 if(!knowledge.approved)reasons.push('KNOWLEDGE_UNAPPROVED');
 if(!draft||typeof draft.subject!=='string'||typeof draft.body!=='string'||!Array.isArray(draft.claim_ids))return {allowed:false,approval_required:true,reasons:['INVALID_DRAFT']};
 const approved=knowledge.claims.filter(c=>draft.claim_ids.includes(c.id));
 if(!approved.length||approved.length!==draft.claim_ids.length)reasons.push('UNAPPROVED_CLAIM');
 const allowedBody=approved.map(c=>c.text).join(' ')+' '+knowledge.cta;
 if(draft.body!==allowedBody||draft.cta!==knowledge.cta||draft.subject!==`A discovery conversation about ${knowledge.product}`)reasons.push('UNSUPPORTED_CONTENT');
 const urls=draft.body.match(/https?:\/\/[^\s]+/g)||[];if(urls.some(u=>!knowledge.allowed_urls.includes(u)))reasons.push('UNAPPROVED_URL');
 if(/[\r\n]/.test(draft.subject)||/\b\d{3}-\d{2}-\d{4}\b|Bearer\s+\S+|sk-[a-zA-Z0-9]{12}/.test(draft.body))reasons.push('SENSITIVE_CONTENT');
 return {allowed:reasons.length===0,approval_required:knowledge.always_require_approval===true||route==='HOT'||route==='MANUAL_REVIEW',reasons};
}
export function toolPolicy(name){if(['read_lead','read_company','read_deal','read_messages','read_product','read_calendar'].includes(name))return 'read';if(['crm_note','crm_task'].includes(name))return 'controlled';if(['external_send','deal_stage','discount','cancellation'].includes(name))return 'protected';return 'denied';}
export function followupEligible(lead,hasReply){return lead.status==='CONTACTED'&&lead.consent&&!lead.opted_out&&!hasReply&&lead.follow_up_count<3;}
export function redact(text){return String(text).replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,'[email]').replace(/\+?\d[\d\s().-]{7,}\d/g,'[number]').replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_.-]+/g,'[secret]');}
