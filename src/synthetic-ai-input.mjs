export function assertSyntheticAiInput(task,input,approved){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 const value=JSON.stringify(canonical(input));
 if(!approved[task]?.some(fixture=>JSON.stringify(canonical(fixture))===value))throw Error('AI_SYNTHETIC_ONLY');
 return input;
}
