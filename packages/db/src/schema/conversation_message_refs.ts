import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { conversationMessages } from "./conversation_messages.js";

export const conversationMessageRefs = pgTable(
  "conversation_message_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    refKind: text("ref_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    displayText: text("display_text").notNull(),
    refOrigin: text("ref_origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyRefTargetIdx: index("conversation_message_refs_company_ref_target_idx").on(
      table.companyId,
      table.refKind,
      table.targetId,
    ),
    messageIdx: index("conversation_message_refs_message_idx").on(table.messageId),
    messageRefTargetUq: uniqueIndex("conversation_message_refs_message_ref_target_uq").on(
      table.messageId,
      table.refKind,
      table.targetId,
    ),
    refKindCheck: check(
      "conversation_message_refs_ref_kind_check",
      sql`${table.refKind} in ('agent', 'issue', 'goal', 'project')`,
    ),
    refOriginCheck: check(
      "conversation_message_refs_ref_origin_check",
      sql`${table.refOrigin} in ('inline_mention', 'active_context')`,
    ),
  }),
);
