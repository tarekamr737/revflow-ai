import {matchesSchema} from './portable-schema.mjs';
export function decodeOpenRouter(response,request,schema=request.response_format?.json_schema?.schema){
 if(response?.statusCode!==200||response.body?.error)throw Error('AI_PROVIDER_REJECTED');
 const body=response.body,choice=body.choices?.[0];
 const requestedModel=request.model?.replace(/:free$/, '');
 if(![request.model,requestedModel].includes(body.model)||body.choices?.length!==1||choice?.finish_reason!=='stop'||choice.message?.refusal)throw Error('AI_RESPONSE_REJECTED');
 let output;try{output=JSON.parse(choice.message.content);}catch{throw Error('AI_SCHEMA_REJECTED');}
 if(!schema||!matchesSchema(output,schema))throw Error('AI_SCHEMA_REJECTED');
 const token=value=>value===undefined||value===null?null:Number.isInteger(value)&&value>=0?value:(()=>{throw Error('AI_USAGE_REJECTED');})();
 const cost=body.usage?.cost;
 return {output,model:body.model,input_tokens:token(body.usage?.prompt_tokens),output_tokens:token(body.usage?.completion_tokens),cost_usd:typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?cost:null};
}
