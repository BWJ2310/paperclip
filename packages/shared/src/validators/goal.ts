import { z } from "zod";
import { GOAL_LEVELS, GOAL_STATUSES } from "../constants.js";

const listSearchLimitSchema = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .default(20)
  .transform((value) => Math.min(value, 20));

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  level: z.enum(GOAL_LEVELS).optional().default("task"),
  status: z.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: z.string().uuid().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
});

export type CreateGoal = z.infer<typeof createGoalSchema>;

export const listGoalsQuerySchema = z
  .object({
    q: z.string().trim().optional(),
    limit: listSearchLimitSchema,
  })
  .strict();

export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;

export const updateGoalSchema = createGoalSchema.partial();

export type UpdateGoal = z.infer<typeof updateGoalSchema>;
