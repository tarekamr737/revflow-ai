import {readFile,writeFile} from 'node:fs/promises';
import {evaluate} from './run.mjs';
import {cases} from './generate.mjs';
import {MockAdapters} from '../src/adapters.mjs';
import {validateQualification} from '../src/schemas.mjs';
import {redact} from '../src/rules.mjs';
const batches=JSON.parse(await readFile(new URL('./model-responses.json',import.meta.url),'utf8'));
const records=batches.flatMap(b=>b.results);
const key=(version,input)=>JSON.stringify([version,input.message,input.job_title]);
const indexed=new Map();
for(const r of records){if(!r.success||r.model!=='stealth/space-bunny-alpha'||!validateQualification(r.output))throw Error('RECORDED_RESPONSE_INVALID');const k=key(r.prompt_version,r.input);if(indexed.has(k))throw Error('RECORDED_RESPONSE_DUPLICATE');indexed.set(k,r);}
for(const c of cases.filter(c=>c.input.email))for(const v of ['qualification-v1','qualification-v2'])if(!indexed.has(key(v,{message:redact(c.input.message),job_title:redact(c.input.job_title||'')})))throw Error('RECORDED_EVALUATION_INCOMPLETE');
class RecordedAdapters extends MockAdapters {
 mode='evaluation';
 async ai(task,input,version){if(task!=='qualification')throw Error('REPLAY_TASK_DENIED');const r=indexed.get(key(version,input));if(!r)throw Error('REPLAY_INPUT_NOT_RECORDED');return {output:structuredClone(r.output),model:r.model,input_tokens:null,output_tokens:null,cost_usd:null};}
 async effect(){throw Error('EVALUATION_EXTERNAL_EFFECT_DENIED');}
 async available(){throw Error('EVALUATION_CALENDAR_DENIED');}
}
const report=await evaluate({write:false,mode:'recorded-live',adapterFactory:db=>new RecordedAdapters(db)});
report.mode='recorded-live';
report.live_model_evaluation='measured through n8n; exact-response replay through isolated PostgreSQL production functions';
report.dataset.unique_valid_lead_texts=indexed.size/2;
report.dataset.limitations+=' Exact duplicate semantic inputs reuse one recorded model response per prompt version; replay durations are not model latency.';
for(const r of report.results){const samples=records.filter(x=>x.prompt_version===r.prompt_version);const durations=samples.map(x=>x.request_to_validation_ms).sort((a,b)=>a-b);r.scope='Recorded live model responses; deterministic qualification/scoring replay; all business effects disabled';r.replay_latency_mean_ms=r.latency_mean_ms;delete r.latency_mean_ms;delete r.latency_p95_ms;r.live_model_requests=samples.length;r.request_to_validation_mean_ms=durations.reduce((a,b)=>a+b,0)/durations.length;r.request_to_validation_p95_ms=durations[Math.ceil(durations.length*.95)-1];r.request_duration_scope='n8n request clock through schema validation, excludes pacing wait; includes node handoff';for(const [metric,field] of [['input_tokens','input_tokens'],['output_tokens','output_tokens'],['cost_usd','cost_usd']])r[metric]=samples.every(x=>typeof x[field]==='number')?samples.reduce((sum,x)=>sum+x[field],0):null;}
report.evidence={workflow_id:'RCLkNY28xbAXR7mb',execution_ids:batches.map(b=>b.executionId),requests:records.length,valid:records.filter(r=>r.success).length};
await writeFile(new URL('./results-recorded-live.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
