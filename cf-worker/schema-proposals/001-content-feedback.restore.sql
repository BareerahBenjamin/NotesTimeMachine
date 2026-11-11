-- Only after 001 .down.sql; before restoring 002; fail if the active table exists.
ALTER TABLE content_feedback_archive_001 RENAME TO content_feedback;
-- Follow with 001-content-feedback.sql to recreate indexes.
