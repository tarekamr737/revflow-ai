export const scenarios=Object.freeze({
 meeting:{label:'Meeting request',reply:'Can we schedule a meeting?'},
 question:{label:'Product question',reply:'Please explain the product?'},
 unsubscribe:{label:'Unsubscribe',reply:'Please unsubscribe me.'}
});
export function scenarioFromEvent(id){return Object.keys(scenarios).find(key=>id?.startsWith('scenario-'+key+'-'))||'meeting';}
