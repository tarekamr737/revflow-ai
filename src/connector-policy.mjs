// Shared by local checks and the n8n gateway. Only the policy service holds gateway access.
export function connectorPolicy(input){
 if(!input||typeof input.url!=='string'||input.url.length>2000||!['GET','POST','PATCH','PUT'].includes(input.method))throw Error('CONNECTOR_REQUEST_DENIED');
 const routes=[
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/(contacts|companies)\/search$/,'POST'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/(contacts|companies)$/,'POST'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/(contacts|companies)\/\d+$/,'PATCH'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/deals\/\d+\?properties=hs_is_closed$/,'GET'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/(deals|notes|tasks)$/,'POST'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v3\/objects\/deals\/\d+$/,'PATCH'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v4\/objects\/contacts\/\d+\/associations\/default\/companies\/\d+$/,'PUT'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v4\/objects\/contacts\/\d+\/associations\/deals\?limit=500$/,'GET'],
  ['hubspot',/^https:\/\/api\.hubapi\.com\/crm\/v4\/associations\/tasks\/contacts\/labels$/,'GET'],
  ['gmail',/^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send$/,'POST'],
  ['gmail',/^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile$/,'GET'],
  ['calendar',/^https:\/\/www\.googleapis\.com\/calendar\/v3\/freeBusy$/,'POST'],
  ['calendar',/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/[^/?#]+\/events$/,'POST'],
  ['calendar',/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/[^/?#]+\/events\/[a-f0-9]{64}$/,'GET'],
  ['slack',/^https:\/\/slack\.com\/api\/chat\.postMessage$/,'POST']
 ];
 const route=routes.find(([,pattern,method])=>method===input.method&&pattern.test(input.url));
 if(!route||JSON.stringify(input.body??{}).length>60000)throw Error('CONNECTOR_REQUEST_DENIED');
 return {service:route[0],url:input.url,method:input.method,body:input.body??{}};
}
