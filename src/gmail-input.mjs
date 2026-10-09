export function gmailInput(mail){
 if(!mail||typeof mail.id!=='string'||mail.id.length>200)throw Error('INVALID_GMAIL_EVENT');
 const from=mail.from?.value?.[0]?.address||mail.from?.email||mail.From||mail.from;
 if(typeof from!=='string')throw Error('INVALID_GMAIL_SENDER');
 const email=(from.match(/<([^<>]+)>/)?.[1]||from).trim().toLowerCase();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw Error('INVALID_GMAIL_SENDER');
 const message=mail.text||mail.snippet||'';
 if(typeof message!=='string'||message.length>64000)throw Error('INVALID_GMAIL_BODY');
 return {source:'gmail',source_event_id:mail.id,email,message:message.slice(0,8000),consent:false,provider_id:mail.id,thread_id:typeof mail.threadId==='string'?mail.threadId:null};
}
