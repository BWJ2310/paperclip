import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { conversations } from "@paperclipai/db";
import {
  addConversationParticipantSchema,
  createConversationMessageSchema,
  createConversationSchema,
  createConversationTargetLinkSchema,
  deleteConversationTargetLinkQuerySchema,
  listConversationMessagesQuerySchema,
  listConversationsQuerySchema,
  markConversationReadSchema,
  removeConversationParticipantParamsSchema,
  updateConversationSchema,
} from "@paperclipai/shared";
import { setConversationLiveEventPublishingEnabled } from "../services/live-events.js";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { conversationService } from "../services/conversations.js";

function toConversationActor(req: Request) {
  if (req.actor.type === "agent" && req.actor.agentId) {
    return {
      viewerType: "agent" as const,
      actorType: "agent" as const,
      actorId: req.actor.agentId,
      agentId: req.actor.agentId,
      runId: req.actor.runId ?? null,
    };
  }

  const actor = getActorInfo(req);
  return {
    viewerType: "board" as const,
    actorType: "user" as const,
    actorId: actor.actorId,
    agentId: null,
    runId: actor.runId,
  };
}

export function conversationRoutes(db: Db) {
  const router = Router();
  const svc = conversationService(db);

  setConversationLiveEventPublishingEnabled(true);

  async function loadConversationCompanyId(conversationId: string) {
    return db
      .select({ companyId: conversations.companyId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .then((rows) => rows[0]?.companyId ?? null);
  }

  router.get("/companies/:companyId/conversations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = listConversationsQuerySchema.parse(req.query);
    const rows = await svc.list(companyId, toConversationActor(req), query);
    res.json(rows);
  });

  router.post("/companies/:companyId/conversations", validate(createConversationSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const detail = await svc.create(companyId, toConversationActor(req), req.body);
    res.status(201).json(detail);
  });

  router.get("/conversations/:conversationId", async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const detail = await svc.getDetail(conversationId, toConversationActor(req));
    res.json(detail);
  });

  router.patch("/conversations/:conversationId", validate(updateConversationSchema), async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const detail = await svc.update(conversationId, toConversationActor(req), req.body);
    res.json(detail);
  });

  router.post(
    "/conversations/:conversationId/participants",
    validate(addConversationParticipantSchema),
    async (req, res) => {
      const conversationId = req.params.conversationId as string;
      const companyId = await loadConversationCompanyId(conversationId);
      if (!companyId) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      const participant = await svc.addParticipant(
        conversationId,
        toConversationActor(req),
        req.body.agentId as string,
      );
      res.status(201).json(participant);
    },
  );

  router.delete("/conversations/:conversationId/participants/:agentId", async (req, res) => {
    const params = removeConversationParticipantParamsSchema.parse(req.params);
    const companyId = await loadConversationCompanyId(params.conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    const result = await svc.removeParticipant(
      params.conversationId,
      toConversationActor(req),
      params.agentId,
    );
    res.json(result);
  });

  router.get("/conversations/:conversationId/messages", async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const query = listConversationMessagesQuerySchema.parse(req.query);
    const page = await svc.listMessages(conversationId, toConversationActor(req), query);
    res.json(page);
  });

  router.post("/conversations/:conversationId/messages", validate(createConversationMessageSchema), async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const message = await svc.createMessage(conversationId, toConversationActor(req), req.body);
    res.status(201).json(message);
  });

  router.post("/conversations/:conversationId/read", validate(markConversationReadSchema), async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const readState = await svc.markRead(
      conversationId,
      toConversationActor(req),
      req.body.lastReadSequence as number,
    );
    res.json(readState);
  });

  router.post("/conversations/:conversationId/targets", validate(createConversationTargetLinkSchema), async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const links = await svc.createTargetLinks(conversationId, toConversationActor(req), req.body);
    res.status(201).json(links);
  });

  router.delete("/conversations/:conversationId/targets", async (req, res) => {
    const conversationId = req.params.conversationId as string;
    const companyId = await loadConversationCompanyId(conversationId);
    if (!companyId) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const query = deleteConversationTargetLinkQuerySchema.parse(req.query);
    const result = await svc.deleteTargetLinks(conversationId, toConversationActor(req), query);
    res.json(result);
  });

  return router;
}
