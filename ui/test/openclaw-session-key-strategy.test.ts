import { describe, expect, it } from "vitest";
import { normalizeOpenClawSessionKeyStrategy } from "../src/adapters/openclaw-gateway/session-key-strategy";

describe("normalizeOpenClawSessionKeyStrategy", () => {
  it("defaults missing values to task_key", () => {
    expect(normalizeOpenClawSessionKeyStrategy(undefined)).toBe("task_key");
    expect(normalizeOpenClawSessionKeyStrategy(null)).toBe("task_key");
    expect(normalizeOpenClawSessionKeyStrategy("")).toBe("task_key");
  });

  it("maps legacy issue mode to task_key", () => {
    expect(normalizeOpenClawSessionKeyStrategy("issue")).toBe("task_key");
    expect(normalizeOpenClawSessionKeyStrategy(" ISSUE ")).toBe("task_key");
  });

  it("preserves supported strategy values", () => {
    expect(normalizeOpenClawSessionKeyStrategy("task_key")).toBe("task_key");
    expect(normalizeOpenClawSessionKeyStrategy("fixed")).toBe("fixed");
    expect(normalizeOpenClawSessionKeyStrategy("run")).toBe("run");
  });
});
