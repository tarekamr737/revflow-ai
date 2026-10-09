-- Global failures can have no lead yet; their alerts still use the action ledger.
ALTER TABLE actions ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE approval_requests ADD COLUMN correlation_id uuid;
