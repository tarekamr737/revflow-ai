ALTER TABLE actions ADD COLUMN payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE failed_events ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX actions_recovery_idx ON actions(updated_at) WHERE status IN ('reserved','uncertain');
CREATE TABLE reminders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id), meeting_id uuid NOT NULL UNIQUE REFERENCES meetings(id), due_at timestamptz NOT NULL, sent_at timestamptz);
CREATE INDEX reminders_due_idx ON reminders(due_at) WHERE sent_at IS NULL;
CREATE INDEX reminders_lead_idx ON reminders(lead_id);
