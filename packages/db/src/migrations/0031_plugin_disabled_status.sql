-- Migrate plugins using the "error" + "disabled_by_operator" sentinel pattern
-- to the new first-class "disabled" status.
UPDATE plugins
SET status = 'disabled',
    last_error = CASE
      WHEN last_error = 'disabled_by_operator' THEN NULL
      WHEN last_error LIKE 'disabled_by_operator: %' THEN substring(last_error FROM 23)
      ELSE last_error
    END
WHERE status = 'error'
  AND last_error LIKE 'disabled_by_operator%';
