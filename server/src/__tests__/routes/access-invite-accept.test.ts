import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authUsers, invites, joinRequests } from "@paperclipai/db";
import { accessRoutes } from "../../routes/access.js";
import { errorHandler } from "../../middleware/index.js";

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  isInstanceAdmin: vi.fn(),
  canModifyMember: vi.fn(),
  listMembers: vi.fn(),
  setMemberPermissions: vi.fn(),
  removeMember: vi.fn(),
  suspendMember: vi.fn(),
  unsuspendMember: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalGrants: vi.fn(),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  setUserCompanyAccess: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createApiKey: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  deduplicateAgentName: vi.fn().mockImplementation((name: string) => name),
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../board-claim.js", () => ({
  claimBoardOwnership: vi.fn().mockResolvedValue({
    status: "claimed",
    claimedByUserId: "user-1",
  }),
  inspectBoardClaimChallenge: vi.fn().mockReturnValue({
    status: "available",
    requiresSignIn: true,
    expiresAt: null,
    claimedByUserId: null,
  }),
}));

function createThenable<T>(rows: T[]) {
  return {
    then<TResult>(callback: (rows: T[]) => TResult | PromiseLike<TResult>) {
      return Promise.resolve(callback(rows));
    },
  };
}

function createInviteAcceptDbStub(options?: { actorEmail?: string | null }) {
  const invite = {
    id: "00000000-0000-0000-0000-000000000101",
    companyId: "00000000-0000-0000-0000-000000000001",
    inviteType: "company_join",
    tokenHash: "hash",
    allowedJoinTypes: "both",
    defaultsPayload: null,
    expiresAt: new Date("2026-03-20T00:00:00.000Z"),
    invitedByUserId: null,
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-19T00:00:00.000Z"),
    updatedAt: new Date("2026-03-19T00:00:00.000Z"),
  };
  const insertedValues: { current: Record<string, unknown> | null } = {
    current: null,
  };

  const select = vi.fn((_fields?: unknown) => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn((_condition?: unknown) => {
        if (table === invites) {
          return createThenable([invite]);
        }
        if (table === authUsers) {
          return createThenable([
            { email: options?.actorEmail ?? "board@example.com" },
          ]);
        }
        if (table === joinRequests) {
          return createThenable([]);
        }
        return createThenable([]);
      }),
    })),
  }));

  const tx = {
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((_values: unknown) => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    insert: vi.fn((table: unknown) => {
      if (table !== joinRequests) {
        throw new Error("Unexpected insert table");
      }
      return {
        values: vi.fn((values: Record<string, unknown>) => {
          insertedValues.current = values;
          const createdJoinRequest = {
            id: "00000000-0000-0000-0000-000000000201",
            inviteId: invite.id,
            companyId: invite.companyId,
            requestType: values.requestType,
            status: "pending_approval",
            requestIp: values.requestIp,
            requestingUserId: values.requestingUserId ?? null,
            requestEmailSnapshot: values.requestEmailSnapshot ?? null,
            agentName: values.agentName ?? null,
            adapterType: values.adapterType ?? null,
            capabilities: values.capabilities ?? null,
            agentDefaultsPayload: values.agentDefaultsPayload ?? null,
            claimSecretHash: values.claimSecretHash ?? null,
            claimSecretExpiresAt: values.claimSecretExpiresAt ?? null,
            claimSecretConsumedAt: null,
            createdAgentId: null,
            approvedByUserId: null,
            approvedAt: null,
            rejectedByUserId: null,
            rejectedAt: null,
            createdAt: new Date("2026-03-19T00:00:00.000Z"),
            updatedAt: new Date("2026-03-19T00:00:00.000Z"),
          };
          return {
            returning: vi.fn(() => createThenable([createdJoinRequest])),
          };
        }),
      };
    }),
  };

  return {
    db: {
      select,
      transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) =>
        callback(tx)
      ),
    },
    insertedValues,
  };
}

function createApp(
  actorOverrides: Record<string, unknown>,
  db: Record<string, unknown>
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["00000000-0000-0000-0000-000000000001"],
      source: "session",
      isInstanceAdmin: false,
      ...actorOverrides,
    };
    next();
  });
  app.use(
    "/api",
    accessRoutes(db as any, {
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bindHost: "0.0.0.0",
      allowedHostnames: [],
    })
  );
  app.use(errorHandler);
  return app;
}

describe("POST /invites/:token/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("logs session-backed human join requests with the authenticated board user id", async () => {
    const { db, insertedValues } = createInviteAcceptDbStub({
      actorEmail: "ceo@example.com",
    });

    const res = await request(createApp({}, db))
      .post("/api/invites/token-123/accept")
      .send({ requestType: "human" });

    expect(res.status).toBe(202);
    expect(insertedValues.current?.requestingUserId).toBe("user-1");
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actorType: "user",
        actorId: "user-1",
        action: "join.requested",
        entityType: "join_request",
      })
    );
  });

  it("logs local implicit human join requests with the canonical local-board id", async () => {
    const { db, insertedValues } = createInviteAcceptDbStub();

    const res = await request(
      createApp({ userId: null, source: "local_implicit" }, db)
    )
      .post("/api/invites/token-123/accept")
      .send({ requestType: "human" });

    expect(res.status).toBe(202);
    expect(insertedValues.current?.requestingUserId).toBe("local-board");
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actorType: "user",
        actorId: "local-board",
        action: "join.requested",
        entityType: "join_request",
      })
    );
  });
});
