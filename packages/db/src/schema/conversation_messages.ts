import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { conversations } from "./conversations.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    authorType: text("author_type").notNull(),
    authorUserId: text("author_user_id"),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    runId: uuid("run_id").references((): AnyPgColumn => heartbeatRuns.id, { onDelete: "set null" }),
    bodyMarkdown: text("body_markdown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyConversationSequenceIdx: index("conversation_messages_company_conversation_sequence_idx").on(
      table.companyId,
      table.conversationId,
      table.sequence,
    ),
    conversationSequenceUq: uniqueIndex("conversation_messages_conversation_sequence_uq").on(
      table.conversationId,
      table.sequence,
    ),
    authorTypeCheck: check(
      "conversation_messages_author_type_check",
      sql`${table.authorType} in ('user', 'agent', 'system')`,
    ),
    authorTruthTableCheck: check(
      "conversation_messages_author_truth_table_check",
      sql`(
        (${table.authorType} = 'user' and ${table.authorUserId} is not null and ${table.authorAgentId} is null)
        or (${table.authorType} = 'agent' and ${table.authorUserId} is null and ${table.authorAgentId} is not null)
        or (${table.authorType} = 'system' and ${table.authorUserId} is null and ${table.authorAgentId} is null)
      )`,
    ),
    runAuthorCheck: check(
      "conversation_messages_run_author_check",
      sql`${table.runId} is null or (${table.authorType} = 'agent' and ${table.authorAgentId} is not null and ${table.authorUserId} is null)`,
    ),
    sequenceCheck: check("conversation_messages_sequence_check", sql`${table.sequence} > 0`),
  }),
);
