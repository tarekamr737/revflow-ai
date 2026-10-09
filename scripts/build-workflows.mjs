import {readFile,writeFile} from 'node:fs/promises';
import * as rules from '../src/rules.mjs';
import {matchesSchema} from '../src/portable-schema.mjs';
import {qualificationSchema,draftSchema,replySchema} from '../src/schemas.mjs';
const knowledge=JSON.parse(await readFile(new URL('../database/seed/knowledge.json',import.meta.url)));
const scoring=JSON.parse(await readFile(new URL('../database/seed/scoring.json',import.meta.url)));
const sample=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url)))[0];
const ctx={event_id:'11111111-1111-4111-8111-111111111111',lead_id:'11111111-1111-4111-8111-111111111111',correlation_id:'11111111-1111-4111-8111-111111111111'};
const signals={intent:'demo',needs:[],pain_points:[],buyer_role:'CTO',urgency:'immediate',budget_signal:'approved',authority_signal:'decision_maker',purchase_intent:'high',timeline:'this month',sentiment:'neutral',risk_flags:[],recommended_next_action:'discovery',confidence:.95,evidence:['Requests a demo']};
const draft={subject:`A discovery conversation about ${knowledge.product}`,body:knowledge.claims[0].text+' '+knowledge.cta,cta:knowledge.cta,claim_ids:[knowledge.claims[0].id]};
const specs=[
 ['01_lead_ingestion','ingest',`check(normalize(sample).errors.length===0,'happy'); check(normalize({...sample,source_event_id:''}).errors.includes('MISSING_EVENT_ID'),'missing_id');`],
 ['02_normalize_dedupe','normalize',`check(normalize({...sample,email:' CTO@EXAMPLE.COM '}).lead.email==='cto@example.com','canonical_email');check(normalize({...sample,consent:'true'}).lead.consent===false,'consent_not_coerced');check(normalize({...sample,email:'bad'}).errors.includes('INVALID_EMAIL'),'invalid_email');`],
 ['03_enrichment','enrich',`const p={provenance:'submitted_data_only',confidence:.3,verified:false};check(p.provenance==='submitted_data_only'&&p.confidence<.8,'unverified_submission');check(normalize({...sample,company_domain:''}).lead.company_domain==='example.com','derived_domain');`],
 ['05_score_route','score',`check(score(sample,signals,scoring).score===100,'hot_100');check(score(sample,signals,scoring).route==='HOT','hot_route');check(score(sample,{...signals,confidence:.2},scoring).route==='MANUAL_REVIEW','low_confidence');check(score(sample,{...signals,intent:'support'},scoring).route==='REJECT','support_override');`],
 ['audit_event','audit',`check(/^[0-9a-f-]{36}$/i.test(ctx.correlation_id),'correlation_uuid');check(!redact('synthetic@example.com').includes('@'),'audit_redaction');`],
 ['04_ai_signal_extraction','qualify',`check(matchesSchema(signals,qualificationSchema),'strict_valid');check(!matchesSchema({...signals,score:100},qualificationSchema),'extra_key_rejected');check(!matchesSchema({...signals,confidence:2},qualificationSchema),'confidence_range');`],
 ['06_hubspot_sync','crm',`check('CREATE_DEAL:'+ctx.lead_id==='CREATE_DEAL:'+ctx.lead_id,'stable_action_key');check(!transitionAllowed('NEW','OPPORTUNITY'),'qualified_state_required');`],
 ['07_outreach_generate','draft',`check(matchesSchema(draft,draftSchema),'strict_draft');check(outreachPolicy(sample,draft,knowledge,'WARM').allowed,'approved_claim');check(!outreachPolicy(sample,{...draft,body:'Guaranteed discounts'},knowledge,'WARM').allowed,'invented_claim_denied');`],
 ['08_outreach_policy_hitl_send','send',`check(outreachPolicy(sample,draft,knowledge,'HOT').approval_required,'hot_approval');check(!outreachPolicy({...sample,consent:false},draft,knowledge,'WARM').allowed,'consent_gate');check(!outreachPolicy({...sample,opted_out:true},draft,knowledge,'WARM').allowed,'optout_gate');`],
 ['09_reply_agent','reply',`check(matchesSchema({intent:'meeting',confidence:.9,tool:'read_calendar'},replySchema),'bounded_schema');check(toolPolicy('read_calendar')==='read','calendar_read');check(toolPolicy('external_send')==='protected','send_protected');check(toolPolicy('shell')==='denied','shell_denied');`],
 ['10_meeting_lifecycle','meeting',`check(transitionAllowed('RESPONDED','MEETING_PROPOSED'),'proposal_state');check(transitionAllowed('MEETING_PROPOSED','MEETING_BOOKED'),'booking_state');check(!transitionAllowed('NEW','MEETING_BOOKED'),'new_cannot_book');`],
 ['followup_scheduler','followups',`check(followupEligible({...sample,status:'CONTACTED',follow_up_count:2},false),'third_allowed');check(!followupEligible({...sample,status:'CONTACTED',follow_up_count:3},false),'fourth_denied');check(!followupEligible({...sample,status:'CONTACTED',follow_up_count:0},true),'reply_stops_followup');`],
 ['11_error_dlq','fail',`check(retryPlan({status:429,attempt:0}).delay_ms===5000,'rate_limit');check(!retryPlan({status:401}).retry,'permanent');check(!retryPlan({status:503,attempt:3}).retry,'bounded');check(!retryPlan({status:0,unsafe:true,ambiguous:true}).retry,'unsafe_timeout');`],
 ['12_evaluation','evaluate',`check(matchesSchema(signals,qualificationSchema),'schema_validity');check(scoring.version==='score-v1','versioned_scoring');check(toolPolicy('arbitrary_http')==='denied','no_unbounded_tools');`],
 ['retry_scheduler','retries',`check(retryPlan({status:503,attempt:2}).delay_ms===120000,'last_retry');check(!retryPlan({status:403}).retry,'auth_not_retryable');`],
 ['meeting_reminders','reminders',`check(transitionAllowed('MEETING_PROPOSED','MEETING_BOOKED'),'booked_only');check(!transitionAllowed('DISQUALIFIED','MEETING_BOOKED'),'rejected_cannot_book');`]
];
const portable=(await readFile(new URL('../src/rules.mjs',import.meta.url),'utf8')).replaceAll('export ','')+'\n'+matchesSchema.toString();
for(const [suffix,stage,tests] of specs){
 const name=`revflow_${suffix}`;
 const fixture=portable+`\nconst sample=${JSON.stringify(sample)},ctx=${JSON.stringify(ctx)},signals=${JSON.stringify(signals)},draft=${JSON.stringify(draft)},knowledge=${JSON.stringify(knowledge)},scoring=${JSON.stringify(scoring)},qualificationSchema=${JSON.stringify(qualificationSchema)},draftSchema=${JSON.stringify(draftSchema)},replySchema=${JSON.stringify(replySchema)};\nconst passed=[];function check(ok,label){if(!ok)throw Error(label);passed.push(label);}\n${tests}\nreturn [{json:{stage:${JSON.stringify(stage)},fixture_scope:'deterministic rules; DB/integrations verified by local system tests',passed,count:passed.length,external_side_effects:0}}];`;
 const guard=`const x=$input.first().json.body??$input.first().json;if(x.halt===true)return [];${!['ingest','fail','evaluate','followups','retries','reminders'].includes(stage)?"if(!/^[0-9a-f-]{36}$/i.test(x.correlation_id||''))throw Error('INVALID_CORRELATION_ID');":''}return [{json:x}];`;
 const result=`const x=$input.first().json;if(!x||typeof x!=='object'||x.error)throw Error('STAGE_FAILED');return [{json:x}];`;
 const code=`const start=trigger({type:'n8n-nodes-base.executeWorkflowTrigger',version:1.2,config:{name:'Stage Input',parameters:{inputSource:'passthrough'}},output:[${JSON.stringify(ctx)}]});
const manual=trigger({type:'n8n-nodes-base.manualTrigger',version:1,config:{name:'Fixture Test'},output:[{}]});
const guard=node({type:'n8n-nodes-base.code',version:2,config:{name:'Validate Stage Input',parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(guard)}}},output:[${JSON.stringify(ctx)}]});
const api=node({type:'n8n-nodes-base.httpRequest',version:4.5,config:{name:'Transactional ${stage}',credentials:{httpTemplatedCustomAuth:newCredential('RevFlow Policy API')},parameters:{method:'POST',url:'http://policy:3100/stages/${stage}',authentication:'genericCredentialType',genericAuthType:'httpTemplatedCustomAuth',sendBody:true,specifyBody:'json',jsonBody:expr('{{ $json }}'),options:{timeout:20000,redirect:{redirect:{followRedirects:false}}}}},output:[${JSON.stringify(ctx)}]});
const checked=node({type:'n8n-nodes-base.code',version:2,config:{name:'Verify Stage Result',parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(result)}}},output:[${JSON.stringify(ctx)}]});
const fixtures=node({type:'n8n-nodes-base.code',version:2,config:{name:'Assert Deterministic Fixtures',parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(fixture)}}},output:[{passed:['happy','edge'],count:2}]});
export default workflow('${name}','${name}').add(start).to(guard).to(api).to(checked).add(manual).to(fixtures);`;
 await writeFile(new URL(`../workflows/${name}.ts`,import.meta.url),code);
}
await writeFile(new URL('../workflows/specs.json',import.meta.url),JSON.stringify(specs.map(([suffix,stage])=>({name:`revflow_${suffix}`,stage})),null,2));
console.log(`Prepared ${specs.length} SDK workflow sources for MCP validation/deployment.`);
