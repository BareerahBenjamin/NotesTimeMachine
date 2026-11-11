-- Only for rolling back a NEW installation of 001, after 002 is rolled back.
-- Do not run against a pre-existing feedback installation.
-- Preserve all data in an archive, never DROP the submitted feedback table.
DROP INDEX IF EXISTS idx_content_feedback_target;
DROP INDEX IF EXISTS idx_content_feedback_issue;
ALTER TABLE content_feedback RENAME TO content_feedback_archive_001;
