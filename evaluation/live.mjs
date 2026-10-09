import {evaluate} from './run.mjs';
import {LiveAdapters,MockAdapters} from '../src/adapters.mjs';
if(!process.env.AI_GATEWAY_URL?.startsWith('https://')||!process.env.AI_GATEWAY_TOKEN)throw Error('Configure the authenticated n8n AI gateway before running live evaluation.');
class EvaluationAdapters extends MockAdapters {
 mode='evaluation';
 async ai(task,input,version){if(task!=='qualification')throw Error('EVALUATION_TASK_DENIED');return new LiveAdapters(process.env).ai(task,input,version);}
 async effect(){throw Error('EVALUATION_EXTERNAL_EFFECT_DENIED');}
 async available(){throw Error('EVALUATION_CALENDAR_DENIED');}
}
console.log(JSON.stringify(await evaluate({mode:'live',adapterFactory:db=>new EvaluationAdapters(db)}),null,2));
