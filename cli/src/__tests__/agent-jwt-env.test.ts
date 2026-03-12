import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureAgentJwtSecret,
  loadPaperclipEnvFile,
  readAgentJwtSecretFromEnv,
  resolveAgentJwtEnvFile,
} from "../config/env.js";
import { agentJwtSecretCheck } from "../checks/agent-jwt-secret-check.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_CWD = process.cwd();

function tempConfigPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-jwt-env-"));
  const configDir = path.join(dir, "custom");
  fs.mkdirSync(configDir, { recursive: true });
  return path.join(configDir, "config.json");
}

describe("agent jwt env helpers", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAPERCLIP_AGENT_JWT_SECRET;
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    process.env = { ...ORIGINAL_ENV };
  });

  it("writes .env next to explicit config path", () => {
    const configPath = tempConfigPath();
    const result = ensureAgentJwtSecret(configPath);

    expect(result.created).toBe(true);

    const envPath = resolveAgentJwtEnvFile(configPath);
    expect(fs.existsSync(envPath)).toBe(true);
    const contents = fs.readFileSync(envPath, "utf-8");
    expect(contents).toContain("PAPERCLIP_AGENT_JWT_SECRET=");
  });

  it("loads secret from .env next to explicit config path", () => {
    const configPath = tempConfigPath();
    const envPath = resolveAgentJwtEnvFile(configPath);
    fs.writeFileSync(envPath, "PAPERCLIP_AGENT_JWT_SECRET=test-secret\n", { mode: 0o600 });

    const loaded = readAgentJwtSecretFromEnv(configPath);
    expect(loaded).toBe("test-secret");
    expect(process.env.PAPERCLIP_AGENT_JWT_SECRET).toBe("test-secret");
  });

  it("doctor check passes when secret exists in adjacent .env", () => {
    const configPath = tempConfigPath();
    const envPath = resolveAgentJwtEnvFile(configPath);
    fs.writeFileSync(envPath, "PAPERCLIP_AGENT_JWT_SECRET=check-secret\n", { mode: 0o600 });

    const result = agentJwtSecretCheck(configPath);
    expect(result.status).toBe("pass");
  });

  it("loads DATABASE_URL from repo-root .env when adjacent .paperclip/.env is absent", () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cli-env-"));
    process.chdir(repoDir);

    const configPath = path.join(repoDir, ".paperclip", "config.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(path.join(repoDir, ".env"), "DATABASE_URL=postgres://root-user:root-pass@localhost:5432/paperclip\n");

    delete process.env.DATABASE_URL;
    loadPaperclipEnvFile(configPath);

    expect(process.env.DATABASE_URL).toBe("postgres://root-user:root-pass@localhost:5432/paperclip");
  });
});
