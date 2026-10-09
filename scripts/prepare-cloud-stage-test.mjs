import {readFile,writeFile} from 'node:fs/promises';
const endpoint=process.argv[2];if(!/^https:\/\/[a-z-]+\.trycloudflare\.com$/.test(endpoint||''))throw Error('TEMP_ENDPOINT_INVALID');
const refs=JSON.parse(await readFile(new URL('../workflows/references.json',import.meta.url),'utf8'));
const plans=[];
for(const r of refs.workflows.filter(r=>!['revflow_ai_gateway','revflow_connector_gateway'].includes(r.name))){const file=new URL(`../workflows/${r.name}.ts`,import.meta.url);const code=(await readFile(file,'utf8')).replaceAll(/http:\/\/policy:3100|https:\/\/[a-z-]+\.trycloudflare\.com/g,endpoint);plans.push({id:r.id,name:r.name,stage:r.stage,code,operations:[{type:'updateNodeParameters',nodeName:r.name==='revflow_gmail_intake'?'Resolve Persisted Thread':'Transactional '+r.stage,parameters:{url:endpoint+'/stages/'+(r.name==='revflow_gmail_intake'?'gmail':r.stage)}}]});await writeFile(file,code);}
await writeFile(new URL('../.tmp/cloud-stage-plans.json',import.meta.url),JSON.stringify(plans));
console.log('Prepared stage-only test endpoint changes for MCP validation.');
