import {readFile,writeFile} from 'node:fs/promises';
const refs=JSON.parse(await readFile(new URL('../workflows/references.json',import.meta.url),'utf8'));
const plans=[];const endpoint=refs.instance+'/webhook/revflow-connectors';
for(const r of refs.workflows.filter(r=>!['revflow_ai_gateway','revflow_connector_gateway'].includes(r.name))){
 const file=new URL(`../workflows/${r.name}.ts`,import.meta.url);let code=await readFile(file,'utf8');const stage=r.name==='revflow_gmail_intake'?'gmail':r.stage;
 code=code.replace(/https:\/\/policy\.revflow\.invalid\/stages\/[a-z]+/g,endpoint).replace("httpTemplatedCustomAuth:newCredential('RevFlow Policy API')","httpHeaderAuth:newCredential('RevFlow Gateway Token')").replace("genericAuthType:'httpTemplatedCustomAuth'","genericAuthType:'httpHeaderAuth'").replace("jsonBody:expr('{{ $json }}')",`jsonBody:expr('{{ { operation: "policy", stage: "${stage}", input: $json } }}')`);
 if(!code.includes(`stage: "${stage}"`))throw Error('STAGE_PATCH_FAILED');
 const nodeName=r.name==='revflow_gmail_intake'?'Resolve Persisted Thread':'Transactional '+stage;
 const operations=[{type:'updateNodeParameters',nodeName,parameters:{url:endpoint,genericAuthType:'httpHeaderAuth',jsonBody:`={{ { operation: "policy", stage: "${stage}", input: $json } }}`,options:{timeout:65000,redirect:{redirect:{followRedirects:false}}}}},{type:'setNodeCredential',nodeName,credentialKey:'httpHeaderAuth',credentialId:'GUfF696yoXIFpyVw',credentialName:'RevFlow Gateway Token'}];
 plans.push({id:r.id,name:r.name,stage,code,operations});await writeFile(file,code);
}
await writeFile(new URL('../.tmp/session-stage-plans.json',import.meta.url),JSON.stringify(plans));console.log(`Prepared ${plans.length} policy relay updates for MCP validation.`);
