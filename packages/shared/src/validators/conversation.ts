import { z } from "zod";
import {
  CONVERSATION_ACTOR_TYPES,
  CONVERSATION_AUTHOR_TYPES,
  CONVERSATION_LINK_ORIGINS,
  CONVERSATION_MEMORY_BUILD_STATUSES,
  CONVERSATION_MESSAGE_REF_KINDS,
  CONVERSATION_MESSAGE_REF_ORIGINS,
  CONVERSATION_RESPONSE_MODES,
  CONVERSATION_STATUSES,
  CONVERSATION_TARGET_KINDS,
} from "../constants.js";

function dedupeIds(values: string[]) {
  return [...new Set(values)];
}

const targetKindSchema = z.enum(CONVERSATION_TARGET_KINDS);

export const createConversationSchema = z.object({
  title: z.string().min(1),
  participantAgentIds: z.array(z.string().uuid()).default([]).transform(dedupeIds),
}).strict();

export const updateConversationSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
}).strict();

export const listConversationsQuerySchema = z.object({
  status: z.enum([...CONVERSATION_STATUSES, "all"]).optional().default("active"),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
}).strict();

export const addConversationParticipantSchema = z.object({
  agentId: z.string().uuid(),
}).strict();

export const removeConversationParticipantParamsSchema = z.object({
  conversationId: z.string().uuid(),
  agentId: z.string().uuid(),
}).strict();

export const conversationActiveContextTargetSchema = z.object({
  targetKind: targetKindSchema,
  targetId: z.string().uuid(),
  displayText: z.string().min(1),
}).strict();

export const createConversationMessageSchema = z.object({
  bodyMarkdown: z.string().min(1),
  activeContextTargets: z.array(conversationActiveContextTargetSchema).superRefine((targets, ctx) => {
    const seen = new Set<string>();
    for (const [index, target] of targets.entries()) {
      const key = `${target.targetKind}:${target.targetId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "Duplicate active context target.",
        });
        continue;
      }
      seen.add(key);
    }
  }),
}).strict();

export const listConversationMessagesQuerySchema = z.object({
  beforeSequence: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().optional(),
  targetKind: targetKindSchema.optional(),
  targetId: z.string().uuid().optional(),
  aroundMessageId: z.string().uuid().optional(),
  before: z.coerce.number().int().nonnegative().max(100).optional(),
  after: z.coerce.number().int().nonnegative().max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.targetKind && !value.targetId) || (!value.targetKind && value.targetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.targetKind ? ["targetId"] : ["targetKind"],
      message: "targetKind and targetId must be provided together.",
    });
  }

  if (value.aroundMessageId && value.beforeSequence !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["beforeSequence"],
      message: "beforeSequence cannot be combined with aroundMessageId.",
    });
  }

  if (value.aroundMessageId && (value.q !== undefined || value.targetKind || value.targetId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aroundMessageId"],
      message: "aroundMessageId is a standalone retrieval mode.",
    });
  }

  if (!value.aroundMessageId && (value.before !== undefined || value.after !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.before !== undefined ? ["before"] : ["after"],
      message: "before/after require aroundMessageId.",
    });
  }
});

export const markConversationReadSchema = z.object({
  lastReadSequence: z.coerce.number().int().nonnegative(),
}).strict();

export const createConversationTargetLinkSchema = z.object({
  targetKind: targetKindSchema,
  targetId: z.string().uuid(),
  anchorMessageId: z.string().uuid(),
  agentIds: z.array(z.string().uuid()).min(1).transform(dedupeIds),
}).strict();

export const deleteConversationTargetLinkQuerySchema = z.object({
  targetKind: targetKindSchema,
  targetId: z.string().uuid(),
  agentIds: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .transform((value) => dedupeIds(Array.isArray(value) ? value : [value])),
}).strict();

export const conversationMessageRefKindSchema = z.enum(CONVERSATION_MESSAGE_REF_KINDS);
export const conversationMessageRefOriginSchema = z.enum(CONVERSATION_MESSAGE_REF_ORIGINS);
export const conversationAuthorTypeSchema = z.enum(CONVERSATION_AUTHOR_TYPES);
export const conversationLinkOriginSchema = z.enum(CONVERSATION_LINK_ORIGINS);
export const conversationActorTypeSchema = z.enum(CONVERSATION_ACTOR_TYPES);
export const conversationMemoryBuildStatusSchema = z.enum(CONVERSATION_MEMORY_BUILD_STATUSES);
export const conversationResponseModeSchema = z.enum(CONVERSATION_RESPONSE_MODES);
