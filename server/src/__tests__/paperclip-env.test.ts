import { afterEach, describe, expect, it } from "vitest";
import {
  buildPaperclipEnv,
  readPaperclipInvokeContext,
} from "../adapters/utils.js";
import { renderPaperclipConversationReplyNote } from "@paperclipai/adapter-utils/server-utils";

const ORIGINAL_PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL;
const ORIGINAL_PAPERCLIP_LISTEN_HOST = process.env.PAPERCLIP_LISTEN_HOST;
const ORIGINAL_PAPERCLIP_LISTEN_PORT = process.env.PAPERCLIP_LISTEN_PORT;
const ORIGINAL_HOST = process.env.HOST;
const ORIGINAL_PORT = process.env.PORT;

afterEach(() => {
  if (ORIGINAL_PAPERCLIP_API_URL === undefined)
    delete process.env.PAPERCLIP_API_URL;
  else process.env.PAPERCLIP_API_URL = ORIGINAL_PAPERCLIP_API_URL;

  if (ORIGINAL_PAPERCLIP_LISTEN_HOST === undefined)
    delete process.env.PAPERCLIP_LISTEN_HOST;
  else process.env.PAPERCLIP_LISTEN_HOST = ORIGINAL_PAPERCLIP_LISTEN_HOST;

  if (ORIGINAL_PAPERCLIP_LISTEN_PORT === undefined)
    delete process.env.PAPERCLIP_LISTEN_PORT;
  else process.env.PAPERCLIP_LISTEN_PORT = ORIGINAL_PAPERCLIP_LISTEN_PORT;

  if (ORIGINAL_HOST === undefined) delete process.env.HOST;
  else process.env.HOST = ORIGINAL_HOST;

  if (ORIGINAL_PORT === undefined) delete process.env.PORT;
  else process.env.PORT = ORIGINAL_PORT;
});

describe("buildPaperclipEnv", () => {
  it("prefers an explicit PAPERCLIP_API_URL", () => {
    process.env.PAPERCLIP_API_URL = "http://localhost:4100";
    process.env.PAPERCLIP_LISTEN_HOST = "127.0.0.1";
    process.env.PAPERCLIP_LISTEN_PORT = "3101";

    const env = buildPaperclipEnv({ id: "agent-1", companyId: "company-1" });

    expect(env.PAPERCLIP_API_URL).toBe("http://localhost:4100");
  });

  it("uses runtime listen host/port when explicit URL is not set", () => {
    delete process.env.PAPERCLIP_API_URL;
    process.env.PAPERCLIP_LISTEN_HOST = "0.0.0.0";
    process.env.PAPERCLIP_LISTEN_PORT = "3101";
    process.env.PORT = "3100";

    const env = buildPaperclipEnv({ id: "agent-1", companyId: "company-1" });

    expect(env.PAPERCLIP_API_URL).toBe("http://localhost:3101");
  });

  it("formats IPv6 hosts safely in fallback URL generation", () => {
    delete process.env.PAPERCLIP_API_URL;
    process.env.PAPERCLIP_LISTEN_HOST = "::1";
    process.env.PAPERCLIP_LISTEN_PORT = "3101";

    const env = buildPaperclipEnv({ id: "agent-1", companyId: "company-1" });

    expect(env.PAPERCLIP_API_URL).toBe("http://[::1]:3101");
  });

  it("publishes canonical issue task scope and the issue-only compatibility alias", () => {
    const env = buildPaperclipEnv(
      { id: "agent-1", companyId: "company-1" },
      {
        runId: "run-1",
        taskKey: "issue:issue-1",
      }
    );

    expect(env.PAPERCLIP_RUN_ID).toBe("run-1");
    expect(env.PAPERCLIP_TASK_KEY).toBe("issue:issue-1");
    expect(env.PAPERCLIP_TASK_ID).toBe("issue-1");
  });

  it("does not publish PAPERCLIP_TASK_ID for non-issue task scopes", () => {
    const env = buildPaperclipEnv(
      { id: "agent-1", companyId: "company-1" },
      {
        taskKey: "conversation:conversation-1",
      }
    );

    expect(env.PAPERCLIP_TASK_KEY).toBe("conversation:conversation-1");
    expect(env.PAPERCLIP_TASK_ID).toBeUndefined();
  });
});

describe("readPaperclipInvokeContext", () => {
  it("promotes issue ids into canonical taskKey values", () => {
    const result = readPaperclipInvokeContext({
      issueId: "issue-1",
      wakeReason: "issue_assigned",
      issueIds: ["issue-1", "issue-2"],
    });

    expect(result.taskKey).toBe("issue:issue-1");
    expect(result.issueId).toBe("issue-1");
    expect(result.wakeReason).toBe("issue_assigned");
    expect(result.linkedIssueIds).toEqual(["issue-1", "issue-2"]);
  });

  it("upgrades legacy bare-uuid task keys to canonical issue task keys", () => {
    const result = readPaperclipInvokeContext({
      taskKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.taskKey).toBe("issue:11111111-1111-4111-8111-111111111111");
  });
});

describe("renderPaperclipConversationReplyNote", () => {
  it("keeps conversation guidance concise and non-task-oriented", () => {
    const note = renderPaperclipConversationReplyNote({
      conversationId: "conversation-1",
      conversationMessageId: "message-1",
      conversationResponseMode: "optional",
    });

    expect(note).toContain(
      "This wake is optional: reply only if you have something distinct and useful to add."
    );
    expect(note).toContain(
      "Treat conversation messages as conversation, not task assignments, unless the human explicitly asks for concrete work."
    );
    expect(note).toContain(
      "Reply directly and briefly; avoid mentioning or questioning multiple other agents unless a real handoff or blocker requires it."
    );
  });
});
