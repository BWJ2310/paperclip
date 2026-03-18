import { describe, expect, it } from "vitest";
import {
  resolveStructuredMentionSession,
  STRUCTURED_MENTION_PICKER_KINDS,
} from "../src/lib/structured-mention-picker";

describe("resolveStructuredMentionSession", () => {
  it("keeps a bare @ trigger in kind-picker mode before any entity results", () => {
    const session = resolveStructuredMentionSession("");

    expect(session).toEqual({
      stage: "kind",
      kindQuery: "",
      kindOptions: STRUCTURED_MENTION_PICKER_KINDS,
    });
  });

  it("enters issue mention mode directly when @issue is typed", () => {
    const session = resolveStructuredMentionSession("issue");

    expect(session).toEqual({
      stage: "entity",
      kind: "issue",
      entityQuery: "",
    });
  });

  it("keeps the selected kind and uses the remaining suffix as entity search", () => {
    const session = resolveStructuredMentionSession("projectalpha");

    expect(session).toEqual({
      stage: "entity",
      kind: "project",
      entityQuery: "alpha",
    });
  });
});
