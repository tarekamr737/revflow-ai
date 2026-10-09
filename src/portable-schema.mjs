export function matchesSchema(value,schema){
 if(schema.type==='object'){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  if((schema.required||[]).some(k=>!Object.hasOwn(value,k)))return false;
  if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(schema.properties,k)))return false;
  return Object.entries(schema.properties||{}).every(([k,s])=>!Object.hasOwn(value,k)||matchesSchema(value[k],s));
 }
 if(schema.type==='array')return Array.isArray(value)&&(schema.maxItems===undefined||value.length<=schema.maxItems)&&value.every(v=>matchesSchema(v,schema.items));
 if(schema.type==='number')return typeof value==='number'&&Number.isFinite(value)&&(schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);
 if(schema.type==='string')return typeof value==='string'&&(!schema.enum||schema.enum.includes(value))&&(schema.maxLength===undefined||value.length<=schema.maxLength);
 if(schema.type==='boolean')return typeof value==='boolean';
 return false;
}
