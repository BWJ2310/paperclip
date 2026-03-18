import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const agentTargetConversationMemory = pgTable(
  "agent_target_conversation_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    memoryMarkdown: text("memory_markdown").notNull(),
    buildStatus: text("build_status").notNull().default("ready"),
    linkedConversationCount: integer("linked_conversation_count").notNull().default(0),
    linkedMessageCount: integer("linked_message_count").notNull().default(0),
    sourceMessageCount: integer("source_message_count").notNull().default(0),
    lastSourceMessageSequence: bigint("last_source_message_sequence", { mode: "number" }).notNull().default(0),
    latestSourceMessageAt: timestamp("latest_source_message_at", { withTimezone: true }),
    lastBuildError: text("last_build_error"),
    lastRebuiltAt: timestamp("last_rebuilt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTargetAgentIdx: index("agent_target_conversation_memory_company_target_agent_idx").on(
      table.companyId,
      table.targetKind,
      table.targetId,
      table.agentId,
    ),
    agentTargetUq: uniqueIndex("agent_target_conversation_memory_agent_target_uq").on(
      table.agentId,
      table.targetKind,
      table.targetId,
    ),
    targetKindCheck: check(
      "agent_target_conversation_memory_target_kind_check",
      sql`${table.targetKind} in ('issue', 'goal', 'project')`,
    ),
    buildStatusCheck: check(
      "agent_target_conversation_memory_build_status_check",
      sql`${table.buildStatus} in ('ready', 'rebuilding', 'failed')`,
    ),
    linkedConversationCountCheck: check(
      "agent_target_conversation_memory_linked_conversation_count_check",
      sql`${table.linkedConversationCount} >= 0`,
    ),
    linkedMessageCountCheck: check(
      "agent_target_conversation_memory_linked_message_count_check",
      sql`${table.linkedMessageCount} >= 0`,
    ),
    sourceMessageCountCheck: check(
      "agent_target_conversation_memory_source_message_count_check",
      sql`${table.sourceMessageCount} >= 0`,
    ),
    lastSourceMessageSequenceCheck: check(
      "agent_target_conversation_memory_last_source_message_sequence_check",
      sql`${table.lastSourceMessageSequence} >= 0`,
    ),
  }),
);
