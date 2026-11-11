-- After .down.sql, while feedback writes remain disabled, restore preserved tables.
-- Must be followed by 002-feedback-workflow.up.sql to recreate indexes/view.
ALTER TABLE feedback_workflow_archive_002 RENAME TO feedback_workflow;
ALTER TABLE feedback_status_history_archive_002 RENAME TO feedback_status_history;
ALTER TABLE feedback_rate_limits_archive_002 RENAME TO feedback_rate_limits;
