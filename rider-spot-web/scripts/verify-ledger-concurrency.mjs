import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Install dev-only embedded-postgres and pg in a temporary checkout to run this fixture.
const dir=new URL('../../supabase/migrations/',import.meta.url).pathname;
const sql=name=>fs.readFileSync(dir+fs.readdirSync(dir).find(s=>s.startsWith(name)),'utf8');
const server=new EmbeddedPostgres({databaseDir:fs.mkdtempSync('/tmp/riderspot-ledger-'),user:'postgres',password:'fixture-only',port:55439,postgresFlags:['-c','unix_socket_directories='],persistent:false,onLog:()=>{},onError:console.error});
await server.initialise();await server.start();
const pool=new pg.Pool({host:'127.0.0.1',user:'postgres',password:'fixture-only',port:55439,database:'postgres',max:24});
try{
await pool.query(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;
create table rider_earnings(id uuid primary key default gen_random_uuid(),user_id uuid,work_date date,platform text,gross_won integer,deliveries integer,gross_entered boolean,expense_scope text,note text,promo_won int default 0,expenses_won int default 0,tip_won int default 0,paid_at timestamptz,manual_snapshot_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table trips(id uuid primary key,user_id uuid,points jsonb);`);
await pool.query(sql('202611220002').split('create or replace function')[0]);
await pool.query(sql('202611240001').split('DO $repair$')[0]);await pool.query(sql('202611230005'));
const users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
await pool.query('insert into auth.users values ($1),($2)',users);
async function run(u,query,params){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('fixture.uid',$1,true)",[u]);const r=await c.query(query,params);await c.query('commit');return r.rows;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
const jobs=[];
for(const u of users)for(let i=0;i<100;i++)for(let j=0;j<3;j++)jobs.push(run(u,"select rs_append_auto_income($1,now()-interval '1 hour','배민',$2,$2,0,0)",['1800000000000-'+i,3000+i]));
await Promise.all(jobs);
for(const u of users){const [r]=await run(u,'select count(*)::int n,sum(gross_won)::int total,count(distinct user_id)::int owners from rider_auto_deliveries');assert.deepEqual(r,{n:100,total:304950,owners:1});const [e]=(await pool.query('select sum(gross_won)::int n from rider_earnings where user_id=$1',[u])).rows;assert.equal(e.n,304950);}
const archive={trips:[{id:'00000000-0000-4000-8000-000000000003',user_id:users[0],points:[{lat:1,lng:2}]}]};
for(const expected of [1,0]){const [r]=await run(users[0],'select rs_restore_account_backup_v52($1,$2) as data',[users[0],archive]);assert.equal(r.data.restored,expected);}
assert.deepEqual((await pool.query('select points from trips')).rows,[{points:[]}]);
await assert.rejects(run(users[1],'select rs_restore_account_backup_v52($1,$2)',[users[0],archive]),/ACCOUNT_OR_FORMAT/);
console.log('PASS 600 concurrent RPC submissions, 24 database connections, 200 unique records, 304950 per account; RLS isolation, repeated backup restore and GPS stripping passed');
}finally{await pool.end();await new Promise(resolve=>setTimeout(resolve,150));await server.stop();}
