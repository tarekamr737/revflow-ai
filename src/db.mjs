import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function openDb({url=process.env.DATABASE_URL,dir=process.env.DATA_DIR||'.data/dev'}={}) {
 if(url){const pool=new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:5000,statement_timeout:15000});return {query:(s,p)=>pool.query(s,p),exec:s=>pool.query(s),close:()=>pool.end(),transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};}
 if(dir!=='memory://')await mkdir(dir,{recursive:true});
 return new PGlite(dir==='memory://'?undefined:dir);
}
export async function migrate(db){
 await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of (await readdir(new URL('../database/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(`../database/migrations/${name}`,import.meta.url),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
  await db.transaction(async tx=>{const found=(await tx.query('SELECT hash FROM schema_migrations WHERE name=$1',[name])).rows[0];if(found){if(found.hash!==hash)throw Error('IMMUTABLE_MIGRATION_CHANGED');return;}await tx.exec?.(sql)??await tx.query(sql);await tx.query('INSERT INTO schema_migrations(name,hash) VALUES($1,$2)',[name,hash]);});
 }
 for(const [kind,file] of [['scoring','scoring'],['sales','knowledge']]){const data=JSON.parse(await readFile(new URL(`../database/seed/${file}.json`,import.meta.url),'utf8'));await db.query('INSERT INTO config_versions(kind,version,data) VALUES($1,$2,$3) ON CONFLICT(kind,version) DO NOTHING',[kind,data.version,data]);}
}
export async function one(db,sql,params=[]){return (await db.query(sql,params)).rows[0];}
