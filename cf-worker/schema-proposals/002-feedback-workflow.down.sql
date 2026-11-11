-- FIRST disable FEEDBACK_ENABLED and stop writes/review, then take a backup.
-- Reverses the active extension without deleting any submitted feedback or history.
-- Fail rather than overwrite if an archive already exists.
DROP VIEW IF EXISTS feedback_review;
DROP INDEX IF EXISTS idx_feedback_workflow_status;
DROP INDEX IF EXISTS idx_feedback_history_submission;
DROP INDEX IF EXISTS idx_feedback_rate_expiry;
ALTER TABLE feedback_workflow RENAME TO feedback_workflow_archive_002;
ALTER TABLE feedback_status_history RENAME TO feedback_status_history_archive_002;
ALTER TABLE feedback_rate_limits RENAME TO feedback_rate_limits_archive_002;
-- content_feedback and all community tables remain intact.
-- To re-enable without losing workflow history, use 002-feedback-workflow.restore.sql.
