import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ConversationWakePolicy } from "@paperclipai/shared";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    lastMessageSequence: bigint("last_message_sequence", { mode: "number" }).notNull().default(0),
    wakePolicyJson: jsonb("wake_policy_json")
      .$type<ConversationWakePolicy>()
      .notNull()
      .default({
        agentHumanStep: 1,
        hierarchyStep: 1,
        wakeChancePercents: [100, 70, 50],
      }),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusUpdatedAtIdx: index("conversations_company_status_updated_at_idx").on(
      table.companyId,
      table.status,
      table.updatedAt,
    ),
    companyUpdatedAtIdx: index("conversations_company_updated_at_idx").on(table.companyId, table.updatedAt),
    statusCheck: check("conversations_status_check", sql`${table.status} in ('active', 'archived')`),
    lastMessageSequenceCheck: check(
      "conversations_last_message_sequence_check",
      sql`${table.lastMessageSequence} >= 0`,
    ),
  }),
);
