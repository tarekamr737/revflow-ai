// Connection metadata only. Canonical lead/action state never lives here.
export function runtimeSession(input, state, now=Date.now()) {
 const operations=['register','close','status','policy'];
 if(!input || !operations.includes(input.operation))throw Error('SESSION_OPERATION_DENIED');
 if(input.operation==='register'){
  if(!/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(input.endpoint||''))throw Error('SESSION_ENDPOINT_DENIED');
  if(!['synthetic','personal'].includes(input.data_mode))throw Error('SESSION_MODE_DENIED');
  if(input.data_mode==='personal' && (input.acknowledgment!=='OWNER_APPROVED_REAL_DATA_AND_MODEL'||!input.config))throw Error('PERSONAL_CONFIGURATION_REQUIRED');
  if(input.data_mode==='personal'){
   const c=input.config,keys=['email_hashes','domain_hashes','knowledge','calendar_id','slack_channel','pipeline','deal_stage'];
   if(Object.keys(c).some(k=>!keys.includes(k))||['email_hashes','domain_hashes'].some(k=>!Array.isArray(c[k])||!c[k].length||c[k].length>50||c[k].some(v=>! /^[a-f0-9]{64}$/.test(v)))||JSON.stringify(c).length>20000)throw Error('PERSONAL_CONFIGURATION_INVALID');
  }
  if(input.test_recipient_hash!==undefined&&(input.data_mode!=='synthetic'||! /^[a-f0-9]{64}$/.test(input.test_recipient_hash)))throw Error('SESSION_TEST_RECIPIENT_INVALID');
  if(!/^[a-f0-9-]{36}$/.test(input.session_id||''))throw Error('SESSION_ID_REQUIRED');
  if(state.session?.expires_at>now&&state.session.session_id!==input.session_id)throw Error('SESSION_ALREADY_RUNNING');
  state.session={test_recipient_hash:input.data_mode==='synthetic'?input.test_recipient_hash:null,session_id:input.session_id,endpoint:input.endpoint,data_mode:input.data_mode,config:input.data_mode==='personal'?input.config:null,expires_at:now+600000};
  return {kind:'session',body:{ok:true,data_mode:input.data_mode,expires_at:state.session.expires_at}};
 }
 if(input.operation==='close'){if(state.session&&state.session.session_id!==input.session_id)throw Error('SESSION_ID_MISMATCH');delete state.session;return {kind:'session',body:{ok:true,closed:true}};}
 const session=state.session;
 if(!session || session.expires_at<=now)throw Error('SESSION_OFFLINE');
 if(input.operation==='status')return {kind:'session',body:{ok:true,data_mode:session.data_mode,expires_at:session.expires_at}};
 const stages=['ingest','normalize','enrich','qualify','score','crm','draft','send','reply','meeting','fail','followups','retries','reminders','audit','evaluate','gmail'];
 if(!stages.includes(input.stage)||!input.input||typeof input.input!=='object'||Array.isArray(input.input)||JSON.stringify(input.input).length>64000)throw Error('SESSION_STAGE_DENIED');
 return {kind:'policy',url:session.endpoint+'/stages/'+input.stage,body:input.input};
}
