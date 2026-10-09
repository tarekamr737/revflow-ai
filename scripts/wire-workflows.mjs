import {readFile,writeFile} from 'node:fs/promises';
const refs=JSON.parse(await readFile(new URL('../workflows/references.json',import.meta.url))).workflows;
const byStage=Object.fromEntries(refs.map(r=>[r.stage,r]));
const chain=['ingest','normalize','enrich','qualify','score','crm','draft','send'];
const sample=JSON.parse(await readFile(new URL('../database/seed/leads.json',import.meta.url)))[0];
const plan=[];
for(const r of refs){
 const original=await readFile(new URL(`../workflows/${r.name}.ts`,import.meta.url),'utf8');
 const code=original.split('// Wired orchestration')[0];
 const end=code.indexOf('export default workflow(');
 let additions='\n// Wired orchestration\n', graph=code.slice(end).trim().replace(/;$/,'');const operations=[];
 const vars={'Verify Stage Result':'checked','Validate Stage Input':'guard','Assert Deterministic Fixtures':'fixtures'};
 function add(name,type,version,parameters,source,target,credential){
  const variable='n'+operations.filter(o=>o.type==='addNode').length;vars[name]=variable;
  additions+=`const ${variable}=${type.endsWith('Trigger')||type.endsWith('webhook')?'trigger':'node'}({type:${JSON.stringify(type)},version:${version},config:{name:${JSON.stringify(name)},parameters:${JSON.stringify(parameters)}${credential?`,credentials:{${credential}:newCredential('RevFlow Inbound Token')}`:''}},output:[{}]});\n`;
  operations.push({type:'addNode',node:{name,type,typeVersion:version,parameters,position:[700,300+operations.length*70],...(credential?{credentials:{[credential]:{name:'RevFlow Inbound Token'}}}:{})}});
  if(source){operations.push({type:'addConnection',source,target:name});graph+=`.add(${vars[source]}).to(${variable})`;}
  else graph+=`.add(${variable})`;
  if(target){operations.push({type:'addConnection',source:name,target});graph+=`.to(${vars[target]})`;}
 }
 const i=chain.indexOf(r.stage);
 if(i>=0&&i<chain.length-1){const next=byStage[chain[i+1]];add('Continue '+next.stage,'n8n-nodes-base.executeWorkflow',1.4,{source:'database',mode:'once',workflowId:{__rl:true,mode:'id',value:next.id},options:{waitForSubWorkflow:true}},'Verify Stage Result');}
 if(['ingest','send','reply','meeting','followups'].includes(r.stage))add('Authenticated Entry','n8n-nodes-base.webhook',2.1,{httpMethod:'POST',path:'revflow-'+r.stage,authentication:'headerAuth',responseMode:'onReceived',options:{noResponseBody:true}},null,'Validate Stage Input','httpHeaderAuth');
 if(['followups','retries','reminders'].includes(r.stage))add('Due Schedule','n8n-nodes-base.scheduleTrigger',1.4,{rule:{interval:[{field:'minutes',minutesInterval:r.stage==='retries'?1:5}]},misfirePolicy:'coalesce'},null,'Validate Stage Input');
 const wired=code.slice(0,end)+additions+graph+';\n';
 await writeFile(new URL(`../workflows/${r.name}.ts`,import.meta.url),wired);
 plan.push({name:r.name,id:r.id,stage:r.stage,code:wired,operations});
}
await writeFile(new URL('../.tmp/workflow-plan.json',import.meta.url),JSON.stringify(plan));
console.log(`Prepared ${plan.length} MCP update plans; no workflows imported.`);
