const n0=trigger({type:"n8n-nodes-base.manualTrigger",version:1,config:{"name":"Test Account Setup","parameters":{},"position":[0,96]}});
const n1=node({type:"n8n-nodes-base.httpRequest",version:4.5,config:{"name":"List Labels","parameters":{"method":"GET","url":"https://gmail.googleapis.com/gmail/v1/users/me/labels","authentication":"predefinedCredentialType","nodeCredentialType":"gmailOAuth2","options":{"timeout":15000,"redirect":{"redirect":{"followRedirects":false}},"response":{"response":{"fullResponse":true,"neverError":true,"responseFormat":"json"}}}},"position":[272,128],"credentials":{"gmailOAuth2":{"id":"aKHYlx6IP8BHmaf6","name":"RevFlow Gmail Test"}}}});
const n2=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Check Label Missing","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"const r=$input.first().json;if(r.statusCode!==200||!Array.isArray(r.body?.labels))throw Error('GMAIL_LABEL_READ_FAILED');return r.body.labels.some(l=>l.name==='RevFlow')?[]:[{json:{create:true}}];"},"position":[496,128]}});
const n3=node({type:"n8n-nodes-base.httpRequest",version:4.5,config:{"name":"Create RevFlow Label","parameters":{"method":"POST","url":"https://gmail.googleapis.com/gmail/v1/users/me/labels","authentication":"predefinedCredentialType","nodeCredentialType":"gmailOAuth2","sendBody":true,"specifyBody":"json","jsonBody":"{\"name\":\"RevFlow\",\"labelListVisibility\":\"labelShow\",\"messageListVisibility\":\"show\"}","options":{"timeout":15000,"redirect":{"redirect":{"followRedirects":false}},"response":{"response":{"fullResponse":true,"neverError":true,"responseFormat":"json"}}}},"position":[720,128],"credentials":{"gmailOAuth2":{"id":"aKHYlx6IP8BHmaf6","name":"RevFlow Gmail Test"}}}});
const n4=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Verify Label Receipt","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"const r=$input.first().json;if(![200,201,409].includes(r.statusCode))throw Error('GMAIL_LABEL_SETUP_FAILED');if(r.statusCode!==409&&(r.body?.name!=='RevFlow'||typeof r.body?.id!=='string'))throw Error('INVALID_LABEL_RECEIPT');return [{json:{event_type:'TEST_LABEL_READY',label_name:'RevFlow',label_id:r.body?.id||null}}];"},"position":[944,128]}});
const n5=node({type:"n8n-nodes-base.httpRequest",version:4.5,config:{"name":"Check Test Availability","parameters":{"method":"POST","url":"https://www.googleapis.com/calendar/v3/freeBusy","authentication":"predefinedCredentialType","nodeCredentialType":"googleCalendarOAuth2Api","sendBody":true,"specifyBody":"json","jsonBody":"{\"timeMin\":\"2026-10-05T10:00:00Z\",\"timeMax\":\"2026-10-05T10:30:00Z\",\"items\":[{\"id\":\"primary\"}]}","options":{"timeout":15000,"redirect":{"redirect":{"followRedirects":false}},"response":{"response":{"fullResponse":true,"neverError":true,"responseFormat":"json"}}}},"position":[272,320],"credentials":{"googleCalendarOAuth2Api":{"id":"DrDFXBeJjduuKQSJ","name":"RevFlow Calendar Test"}}}});
const n6=node({type:"n8n-nodes-base.code",version:2,config:{"name":"Summarize Calendar Access","parameters":{"mode":"runOnceForAllItems","language":"javaScript","jsCode":"const r=$input.first().json;if(r.statusCode!==200||!r.body?.calendars?.primary||r.body.calendars.primary.errors?.length)throw Error('CALENDAR_ACCESS_FAILED');return [{json:{calendar_access:true,event_writes:0}}];"},"position":[496,320]}});
export default workflow("revflow_test_account_setup","revflow_test_account_setup")
 .add(n0)
 .add(n1)
 .add(n2)
 .add(n3)
 .add(n4)
 .add(n5)
 .add(n6)
 .add(n0.output(0).to(n1))
 .add(n0.output(0).to(n5))
 .add(n1.output(0).to(n2))
 .add(n2.output(0).to(n3))
 .add(n3.output(0).to(n4))
 .add(n5.output(0).to(n6))
 .group("Ensure test label",[n1,n2,n3,n4],{description:"Read before create; only create the fixed RevFlow label."})
 .group("Calendar read check",[n5,n6],{description:"Read one fixed future slot; no bookings or attendee data."});
