-- Additive extension to 001-content-feedback.sql; local/staging review first.
-- No production application is performed by this task.
CREATE TABLE IF NOT EXISTS feedback_workflow (
  submission_id TEXT PRIMARY KEY REFERENCES content_feedback(submission_id),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','triaged','in_progress','resolved','rejected')),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  ai_response_id TEXT,
  last_change_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS feedback_status_history (
  change_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES content_feedback(submission_id),
  from_status TEXT NOT NULL CHECK(from_status IN ('new','triaged','in_progress','resolved','rejected')),
  to_status TEXT NOT NULL CHECK(to_status IN ('new','triaged','in_progress','resolved','rejected')),
  from_version INTEGER NOT NULL,
  reason TEXT CHECK(length(reason) <= 500),
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_workflow_status ON feedback_workflow(status,updated_at);
CREATE INDEX IF NOT EXISTS idx_feedback_history_submission ON feedback_status_history(submission_id,from_version);
-- Short-lived, daily HMAC network buckets; never a raw IP or account identifier.
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK(count >= 1),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_expiry ON feedback_rate_limits(expires_at);
CREATE VIEW IF NOT EXISTS feedback_review AS
SELECT f.*, f.classic_id AS work_id, COALESCE(w.status,'new') AS status,
  COALESCE(w.version,0) AS version, w.ai_response_id,
  COALESCE(w.updated_at,f.created_at) AS updated_at
FROM content_feedback f LEFT JOIN feedback_workflow w USING(submission_id);
