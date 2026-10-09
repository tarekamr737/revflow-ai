import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../workflows/revflow_lead_to_revenue.ts',import.meta.url),'utf8');
const nodes=new Map(),edges=new Map();
for(const line of source.split('\n')){
 const node=line.match(/^const (n\d+)=(?:node|trigger)\(\{type:"[^"]+",version:[^,]+,config:(\{.*\})\}\);$/);
 if(node)nodes.set(node[1],JSON.parse(node[2]));
 const edge=line.match(/\.add\((n\d+)\.output\(0\)\.to\((n\d+)\)\)/);
 if(edge){const list=edges.get(edge[1])||[];list.push(edge[2]);edges.set(edge[1],list);}
}
function stagesFrom(name){
 let id=[...nodes].find(([,node])=>node.name===name)?.[0];assert.ok(id,'trigger exists');
 const stages=[],seen=new Set();
 while(id){
  assert.ok(!seen.has(id),'business path has no cycle');seen.add(id);
  const node=nodes.get(id),stage=node.parameters?.jsCode?.match(/const request=prepareStage\("([a-z]+)"/)?.[1];
  if(stage)stages.push(stage);
  if(node.name==='Await email approval')return stages;
  const next=edges.get(id)||[];assert.equal(next.length,1,'business path must continue through '+node.name);id=next[0];
 }
 throw Error('approval outcome not reachable');
}

test('unified intake completes draft and policy stages before the approval outcome',()=>{
 assert.deepEqual(stagesFrom('Lead received'),['ingest','normalize','enrich','qualify','score','crm','draft','send']);
 assert.deepEqual(stagesFrom('Approved email action'),['send']);
});

test('unified email outcome requires an actual approval, send receipt or policy halt',()=>{
 const code=[...nodes.values()].find(node=>node.name==='Await email approval').parameters.jsCode;
 const outcome=json=>runInNewContext('(function(){'+code+'})()',{$input:{first:()=>({json})}});
 assert.equal(outcome({awaiting_approval:true,approval_id:'fixture-approval'})[0].json.state,'awaiting_email_approval');
 assert.equal(outcome({sent:true})[0].json.state,'email_sent');
 assert.equal(outcome({halt:true,blocked:['NO_CONSENT']})[0].json.state,'outreach_stopped');
 assert.throws(()=>outcome({message_id:'fixture-draft'}),/EMAIL_POLICY_RESULT_REQUIRED/);
 assert.throws(()=>outcome({awaiting_approval:true}),/EMAIL_POLICY_RESULT_REQUIRED/);
});
