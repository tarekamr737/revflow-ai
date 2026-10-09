import {readFile,writeFile} from 'node:fs/promises';
const refs=JSON.parse(await readFile(new URL('../workflows/references.json',import.meta.url))).workflows;
const fail=refs.find(r=>r.stage==='fail');const plan=[];
for(const r of refs){
 let code=await readFile(new URL(`../workflows/${r.name}.ts`,import.meta.url),'utf8');
 const operations=[];let definitions='',graph='';
 const settings={executionTimeout:180,saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false,saveExecutionProgress:false,callerPolicy:'workflowsFromSameOwner',timezone:'UTC'};
 if(r.stage!=='fail'){
  const context="const x=$('Validate Stage Input').first().json;return [{json:{correlation_id:x.correlation_id,lead_id:x.lead_id,error_code:'N8N_STAGE_FAILED',status:400}}];";
  const parameters={source:'database',mode:'once',workflowId:{__rl:true,mode:'id',value:fail.id},options:{waitForSubWorkflow:true}};
  definitions+=`const errorContext=node({type:'n8n-nodes-base.code',version:2,config:{name:'Sanitize Stage Failure',parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(context)}}},output:[{error_code:'N8N_STAGE_FAILED',status:400}]});\nconst errorCall=node({type:'n8n-nodes-base.executeWorkflow',version:1.4,config:{name:'Record Failure',parameters:${JSON.stringify(parameters)}},output:[{}]});\n`;
  code=code.replace(`config:{name:'Transactional ${r.stage}',`,`config:{onError:'continueErrorOutput',name:'Transactional ${r.stage}',`);
  graph+='.add(api.onError(errorContext.to(errorCall)))';
  graph+='.group("Failure audit",[errorContext,errorCall],{description:"Send only safe identifiers and error codes to the shared failure handler."})';
  operations.push({type:'setNodeSettings',nodeName:`Transactional ${r.stage}`,settings:{onError:'continueErrorOutput',retryOnFail:false}},
   {type:'addNode',node:{name:'Sanitize Stage Failure',type:'n8n-nodes-base.code',typeVersion:2,parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:context},position:[550,500]}},
   {type:'addNode',node:{name:'Record Failure',type:'n8n-nodes-base.executeWorkflow',typeVersion:1.4,parameters,position:[750,500]}},
   {type:'addConnection',source:`Transactional ${r.stage}`,sourceIndex:1,target:'Sanitize Stage Failure'},
   {type:'addConnection',source:'Sanitize Stage Failure',target:'Record Failure'});
  operations.push({type:'addNodeGroup',name:'Failure audit',description:'Send safe identifiers and error codes to the shared failure handler.',nodeNames:['Sanitize Stage Failure','Record Failure']});
 }else{
  const js="return [{json:{error_code:'N8N_WORKFLOW_FAILED',status:400}}];";
  definitions+=`const errorTrigger=trigger({type:'n8n-nodes-base.errorTrigger',version:1,config:{name:'Global Failure'},output:[{}]});\nconst sanitize=node({type:'n8n-nodes-base.code',version:2,config:{name:'Sanitize Global Failure',parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(js)}}},output:[{error_code:'N8N_WORKFLOW_FAILED',status:400}]});\n`;
  graph+='.add(errorTrigger).to(sanitize).to(guard)';
  operations.push({type:'addNode',node:{name:'Global Failure',type:'n8n-nodes-base.errorTrigger',typeVersion:1,parameters:{},position:[0,500]}},{type:'addNode',node:{name:'Sanitize Global Failure',type:'n8n-nodes-base.code',typeVersion:2,parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:js},position:[220,500]}},{type:'addConnection',source:'Global Failure',target:'Sanitize Global Failure'},{type:'addConnection',source:'Sanitize Global Failure',target:'Validate Stage Input'});
 }
 const idx=code.indexOf('export default workflow(');code=code.slice(0,idx)+definitions+code.slice(idx).trim().replace(/;$/,'')+graph+'.group("Stage transaction",[guard,api,checked],{description:"Validate input, persist state through the policy API, verify the result."});\n';
 // Error output belongs to the transaction node; grouping it with both exits would cross the group boundary.
 code=code.replace('[guard,api,checked]','[guard,api]');
 const next=code.match(/const (n\d+)=node\(\{type:"n8n-nodes-base.executeWorkflow".*?name:"(Continue [^"]+)"/);
 if(next){code=code.trim().replace(/;$/,'')+`.group('Continue pipeline',[checked,${next[1]}],{description:'Pass persisted context to the next stage; halt guards stop rejected leads.'});\n`;operations.push({type:'addNodeGroup',name:'Continue pipeline',description:'Pass persisted context to the next stage; halt guards stop rejected leads.',nodeNames:['Verify Stage Result',next[2]]});}
 operations.push({type:'addNodeGroup',name:'Stage transaction',description:'Validate input and persist state through the policy API.',nodeNames:['Validate Stage Input',`Transactional ${r.stage}`]},{type:'setWorkflowSettings',settings});
 await writeFile(new URL(`../workflows/${r.name}.ts`,import.meta.url),code);plan.push({id:r.id,stage:r.stage,code,operations});
}
await writeFile(new URL('../.tmp/reliability-plan.json',import.meta.url),JSON.stringify(plan));
console.log('Prepared sanitised error paths and private execution settings.');
