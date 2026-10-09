const n0=trigger({type:"n8n-nodes-base.gmailTrigger",version:1.4,config:{"name":"RevFlow Label Inbox","parameters":{"pollTimes":{"item":[{"mode":"everyMinute"}]},"authentication":"oAuth2","event":"messageReceived","simple":false,"maxResults":5,"filters":{"q":"label:RevFlow newer_than:7d -from:me","includeSpamTrash":false,"includeDrafts":false,"readStatus":"both"},"options":{"downloadAttachments":false}},"position":[0,96],"credentials":{"gmailOAuth2":{"id":"aKHYlx6IP8BHmaf6","name":"RevFlow Gmail Test"}}}});
const n1=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Parse Gmail Safely","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"function gmailInput(mail){\n if(!mail||typeof mail.id!=='string'||mail.id.length>200)throw Error('INVALID_GMAIL_EVENT');\n const from=mail.from?.value?.[0]?.address||mail.from?.email||mail.From||mail.from;\n if(typeof from!=='string')throw Error('INVALID_GMAIL_SENDER');\n const email=(from.match(/<([^<>]+)>/)?.[1]||from).trim().toLowerCase();\n if(!/^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$/.test(email))throw Error('INVALID_GMAIL_SENDER');\n const message=mail.text||mail.snippet||'';\n if(typeof message!=='string'||message.length>64000)throw Error('INVALID_GMAIL_BODY');\n return {source:'gmail',source_event_id:mail.id,email,message:message.slice(0,8000),consent:false,provider_id:mail.id,thread_id:typeof mail.threadId==='string'?mail.threadId:null};\n}\nreturn $input.all().map(x=>{const p=gmailInput(x.json);return {json:{id:p.provider_id,threadId:p.thread_id,from:p.email,text:p.message}}});"},"position":[272,224]}});
const n2=node({type:"n8n-nodes-base.httpRequest",version:4.5,config:{"name":"Resolve Persisted Thread","parameters":{"method":"POST","url":"https://tarek1new.app.n8n.cloud/webhook/revflow-connectors","authentication":"genericCredentialType","genericAuthType":"httpHeaderAuth","sendBody":true,"specifyBody":"json","jsonBody":"={{ { operation: \"policy\", stage: \"gmail\", input: $json } }}","options":{"timeout":65000,"redirect":{"redirect":{"followRedirects":false}}}},"position":[496,224],"credentials":{"httpTemplatedCustomAuth":{"id":"p0dH2xctPYpSlzIA","name":"RevFlow Policy API"},"httpHeaderAuth":{"id":"k3vGVOeETIvmLTL3","name":"RevFlow Gateway Token"}}}});
const n3=node({type:"n8n-nodes-base.code",version:2,config:{"name":"New Inbound Lead","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"const x=$input.first().json;return x.mode==='new'?[{json:x.input}]:[];"},"position":[800,128]}});
const n4=node({type:"n8n-nodes-base.executeWorkflow",version:1.4,config:{"name":"Ingest New Lead","parameters":{"source":"database","mode":"once","workflowId":{"__rl":true,"mode":"id","value":"fYKMJx8pwrtjfGpB"},"options":{"waitForSubWorkflow":true}},"position":[1024,128]}});
const n5=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Existing Conversation","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"const x=$input.first().json;return x.mode==='reply'?[{json:x.ctx}]:[];"},"position":[800,320]}});
const n6=node({type:"n8n-nodes-base.executeWorkflow",version:1.4,config:{"name":"Classify Reply","parameters":{"source":"database","mode":"once","workflowId":{"__rl":true,"mode":"id","value":"yi9xLmEv1TJVM5H6"},"options":{"waitForSubWorkflow":true}},"position":[1024,320]}});
const n7=trigger({type:"n8n-nodes-base.manualTrigger",version:1,config:{"name":"Gmail Fixtures","parameters":{},"position":[0,416]}});
const n8=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Assert Gmail Fixtures","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"function gmailInput(mail){\n if(!mail||typeof mail.id!=='string'||mail.id.length>200)throw Error('INVALID_GMAIL_EVENT');\n const from=mail.from?.value?.[0]?.address||mail.from?.email||mail.From||mail.from;\n if(typeof from!=='string')throw Error('INVALID_GMAIL_SENDER');\n const email=(from.match(/<([^<>]+)>/)?.[1]||from).trim().toLowerCase();\n if(!/^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$/.test(email))throw Error('INVALID_GMAIL_SENDER');\n const message=mail.text||mail.snippet||'';\n if(typeof message!=='string'||message.length>64000)throw Error('INVALID_GMAIL_BODY');\n return {source:'gmail',source_event_id:mail.id,email,message:message.slice(0,8000),consent:false,provider_id:mail.id,thread_id:typeof mail.threadId==='string'?mail.threadId:null};\n}\nconst x=gmailInput({id:'fixture-1',from:'Person <synthetic@example.com>',text:'Meeting?',threadId:'fixture-thread'});if(x.email!=='synthetic@example.com'||x.consent!==false)throw Error('happy');let failed=false;try{gmailInput({id:'fixture-2',from:'bad'});}catch{failed=true;}if(!failed)throw Error('bad_sender');return [{json:{passed:['sender_canonical','consent_not_inferred','bad_sender_rejected'],external_side_effects:0}}];"},"position":[224,416]}});
export default workflow("revflow_gmail_intake","revflow_gmail_intake")
 .add(n0)
 .add(n1)
 .add(n2)
 .add(n3)
 .add(n4)
 .add(n5)
 .add(n6)
 .add(n7)
 .add(n8)
 .add(n0.output(0).to(n1))
 .add(n1.output(0).to(n2))
 .add(n2.output(0).to(n3))
 .add(n2.output(0).to(n5))
 .add(n3.output(0).to(n4))
 .add(n5.output(0).to(n6))
 .add(n7.output(0).to(n8))
 .group("Resolve email",[n1,n2],{description:"Parse sender; match the persisted outbound thread before treating an email as a reply."})
 .group("New lead",[n3,n4],{description:"New inbound email has no inferred marketing consent."})
 .group("Reply",[n5,n6],{description:"Continue only the matching existing conversation."});
