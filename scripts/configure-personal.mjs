import {openDb,one} from '../src/db.mjs';
import {validatePersonalConfig} from '../src/personal-policy.mjs';
import {hash} from '../src/service.mjs';
import {randomUUID} from 'node:crypto';
const c=validatePersonalConfig(JSON.parse(process.env.PERSONAL_CONFIG_JSON||'null'));
const knowledge={...c.knowledge,always_require_approval:true};
const db=await openDb();try{await db.transaction(async tx=>{
 const existing=await one(tx,"SELECT data FROM config_versions WHERE kind='sales' AND version=$1",[knowledge.version]);
 if(existing&&hash(existing.data)!==hash(knowledge))throw Error('SALES_VERSION_IMMUTABLE');
 if(!existing)await tx.query("INSERT INTO config_versions(kind,version,data) VALUES('sales',$1,$2)",[knowledge.version,knowledge]);
 await tx.query('INSERT INTO lead_events(correlation_id,event_type,payload) VALUES($1,$2,$3)',[randomUUID(),'SALES_KNOWLEDGE_APPROVED',{version:knowledge.version}]);
 });console.log('Reviewed sales knowledge configured; recipient addresses were not printed.');}finally{await db.close();}
