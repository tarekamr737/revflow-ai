ALTER TABLE messages ADD COLUMN thread_id text;
CREATE INDEX messages_thread_idx ON messages(thread_id) WHERE thread_id IS NOT NULL;
