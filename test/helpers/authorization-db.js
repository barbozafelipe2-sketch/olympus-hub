import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export async function authorizationDb() {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema app_private;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function app_private.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
 create table profiles(id uuid primary key,display_name text,avatar_url text);
 create table projects(id uuid primary key,owner_id uuid);
 create table conversations(id uuid primary key,owner_id uuid,project_id uuid references projects(id) on delete cascade);`);
 for(const name of ['20261001152742_durable_execution_traces.sql','20261001154043_usage_ledger_and_account_limits.sql','20261001154212_usage_quota_summary_rpc.sql','20261014140427_commercial_ai_budget_controls.sql',...readdirSync('supabase/migrations').filter(n=>n.endsWith('_per_attempt_execution_authorization.sql'))])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 return db;
}
