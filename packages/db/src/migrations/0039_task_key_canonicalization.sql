DELETE FROM "agent_task_sessions" AS legacy
USING "agent_task_sessions" AS canonical
WHERE legacy."task_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND canonical."company_id" = legacy."company_id"
  AND canonical."agent_id" = legacy."agent_id"
  AND canonical."adapter_type" = legacy."adapter_type"
  AND canonical."task_key" = ('issue:' || legacy."task_key");
--> statement-breakpoint
UPDATE "agent_task_sessions"
SET
  "task_key" = ('issue:' || "task_key"),
  "updated_at" = NOW()
WHERE "task_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
