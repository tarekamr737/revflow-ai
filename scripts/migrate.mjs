import {openDb,migrate} from '../src/db.mjs';
const db=await openDb();try{await migrate(db);
 if(process.env.DATABASE_URL&&process.env.APP_DATABASE_PASSWORD){await db.transaction(async tx=>{
  await tx.query("SELECT set_config('revflow.app_password',$1,true)",[process.env.APP_DATABASE_PASSWORD]);
  await tx.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='revflow_app') THEN EXECUTE format('CREATE ROLE revflow_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',current_setting('revflow.app_password')); END IF; END $$");
  await tx.query('GRANT USAGE ON SCHEMA public TO revflow_app');
  await tx.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO revflow_app');
  await tx.query('REVOKE INSERT,UPDATE ON schema_migrations,config_versions FROM revflow_app');
 });}
 console.log('Migrations and versioned seed applied.');}finally{await db.close();}
