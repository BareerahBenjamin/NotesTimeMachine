-- Additive proposal only. NOT applied to production by this task.
CREATE TABLE IF NOT EXISTS content_feedback (
  submission_id TEXT PRIMARY KEY,
  classic_id TEXT NOT NULL,
  paragraph_id TEXT NOT NULL,
  annotation_id TEXT,
  target TEXT NOT NULL CHECK (target IN ('reading','annotation','ai_analysis','annotation_interpretation')),
  rating TEXT NOT NULL CHECK (rating IN ('helpful','unhelpful','problem')),
  issue_type TEXT CHECK (issue_type IN ('inaccurate_content','questionable_source','unclear_explanation','interaction_problem','other')),
  note TEXT CHECK (length(note) <= 500),
  prompt_version TEXT,
  model TEXT,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((rating='problem' AND issue_type IS NOT NULL) OR (rating!='problem' AND issue_type IS NULL)),
  CHECK ((target IN ('annotation','annotation_interpretation') AND annotation_id IS NOT NULL)
     OR (target IN ('reading','ai_analysis') AND annotation_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_content_feedback_target ON content_feedback (classic_id,paragraph_id,annotation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_content_feedback_issue ON content_feedback (issue_type,created_at);
