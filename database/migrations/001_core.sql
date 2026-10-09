CREATE TABLE config_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, version text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,version));
CREATE TABLE leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, source_event_id text NOT NULL,
 name text NOT NULL DEFAULT '', email text, phone text, company_name text NOT NULL DEFAULT '', company_domain text, job_title text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
 consent boolean NOT NULL DEFAULT false, opted_out boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','QUALIFIED','CONTACTED','RESPONDED','MEETING_PROPOSED','MEETING_BOOKED','OPPORTUNITY','WON','LOST','NURTURE','MANUAL_REVIEW','DISQUALIFIED','SPAM')),
 follow_up_count integer NOT NULL DEFAULT 0 CHECK(follow_up_count BETWEEN 0 AND 3), next_follow_up_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_email_idx ON leads(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX leads_phone_idx ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX leads_domain_idx ON leads(company_domain);
CREATE INDEX leads_status_idx ON leads(status);
CREATE INDEX leads_due_idx ON leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL AND consent AND NOT opted_out;
CREATE TABLE raw_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, source_event_id text NOT NULL, correlation_id uuid NOT NULL, lead_id uuid REFERENCES leads(id), payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source,source_event_id));
CREATE TABLE lead_enrichment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), data jsonb NOT NULL, provenance text NOT NULL, confidence numeric NOT NULL CHECK(confidence BETWEEN 0 AND 1), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES leads(id), correlation_id uuid NOT NULL, task text NOT NULL, model text NOT NULL, model_reason text NOT NULL, prompt_version text NOT NULL, schema_version text NOT NULL, latency_ms numeric NOT NULL CHECK(latency_ms>=0), input_tokens integer, output_tokens integer, cost_usd numeric, confidence numeric, success boolean NOT NULL, error_code text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE qualification_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), ai_run_id uuid NOT NULL REFERENCES ai_runs(id), signals jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE lead_scores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), score integer NOT NULL CHECK(score BETWEEN 0 AND 100), route text NOT NULL, config_version text NOT NULL, breakdown jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE crm_sync (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL UNIQUE REFERENCES leads(id), contact_id text, company_id text, deal_id text, sync_hash text NOT NULL, status text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), direction text NOT NULL CHECK(direction IN ('inbound','outbound')), provider_id text UNIQUE, subject text NOT NULL DEFAULT '', body text NOT NULL, draft_hash text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE approval_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), action_key text NOT NULL, payload_hash text NOT NULL, original jsonb NOT NULL, edited jsonb, decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','approved','rejected','consumed')), actor text, expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(action_key,payload_hash));
CREATE TABLE actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), correlation_id uuid NOT NULL, action_key text NOT NULL UNIQUE, kind text NOT NULL, payload_hash text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','completed','failed','uncertain')), result jsonb, attempts integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE lead_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES leads(id), correlation_id uuid NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE failed_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES leads(id), correlation_id uuid NOT NULL, error_class text NOT NULL, error_code text NOT NULL, retry_count integer NOT NULL DEFAULT 0, next_retry_at timestamptz, status text NOT NULL DEFAULT 'dead_letter', action_key text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE webhook_nonces (nonce text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE meetings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, provider_id text UNIQUE, status text NOT NULL CHECK(status IN ('proposed','booked','cancelled')), created_at timestamptz NOT NULL DEFAULT now(), CHECK(end_at>start_at), UNIQUE(lead_id,start_at));
CREATE TABLE mock_effects (action_key text PRIMARY KEY, kind text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX raw_events_lead_idx ON raw_events(lead_id);
CREATE INDEX raw_events_correlation_idx ON raw_events(correlation_id);
CREATE INDEX lead_events_correlation_idx ON lead_events(correlation_id,created_at);
CREATE INDEX lead_events_lead_idx ON lead_events(lead_id,created_at);
CREATE INDEX enrichment_lead_idx ON lead_enrichment(lead_id);
CREATE INDEX ai_runs_lead_idx ON ai_runs(lead_id);
CREATE INDEX qualification_lead_idx ON qualification_runs(lead_id,created_at DESC);
CREATE INDEX qualification_ai_idx ON qualification_runs(ai_run_id);
CREATE INDEX scores_lead_idx ON lead_scores(lead_id,created_at DESC);
CREATE INDEX messages_lead_idx ON messages(lead_id,created_at DESC);
CREATE INDEX approvals_lead_idx ON approval_requests(lead_id);
CREATE INDEX approvals_pending_idx ON approval_requests(created_at) WHERE decision='pending';
CREATE INDEX actions_lead_idx ON actions(lead_id);
CREATE INDEX failures_lead_idx ON failed_events(lead_id);
CREATE INDEX failures_due_idx ON failed_events(next_retry_at) WHERE status='retry';
CREATE INDEX meetings_lead_idx ON meetings(lead_id);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
