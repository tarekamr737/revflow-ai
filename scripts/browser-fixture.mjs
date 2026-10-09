const base='http://127.0.0.1:3101';
const health=await(await fetch(base+'/health')).json();if(health.mode!=='mock')throw Error('BROWSER_FIXTURE_REQUIRES_MOCK');
const post=async(stage,body)=>{const r=await fetch(base+'/stages/'+stage,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('FIXTURE_STAGE_FAILED');return r.json();};
let ctx=await post('ingest',{source:'browser-fixture',source_event_id:'review-v2',email:'review-ui-v2@example.com',name:'Synthetic Reviewer',company_name:'Synthetic Company',job_title:'CTO',message:'Demo this month. I own the buying decision.',consent:true});
if(!ctx.halt)for(const stage of ['normalize','enrich','qualify','score','crm','draft','send'])ctx=await post(stage,ctx);
console.log(JSON.stringify({fixture:'synthetic-approval-ui',awaiting_approval:!!ctx.approval_id,duplicate:!!ctx.duplicate}));
