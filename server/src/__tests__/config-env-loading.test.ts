import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_CWD = process.cwd();

async function importLoadConfig() {
  vi.resetModules();
  return (await import("../config.js")).loadConfig;
}

describe("server config env loading", () => {
  beforeEach(() => {
    process.chdir(ORIGINAL_CWD);
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.PAPERCLIP_CONFIG;
  });

  afterEach(() => {
    process.chdir(ORIGINAL_CWD);
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("loads DATABASE_URL from repo-root .env", async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-server-env-"));
    const packageDir = path.join(repoDir, "server");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, ".env"), "DATABASE_URL=postgres://root-user:root-pass@localhost:5432/paperclip\n");

    process.chdir(packageDir);
    const loadConfig = await importLoadConfig();

    expect(loadConfig().databaseUrl).toBe("postgres://root-user:root-pass@localhost:5432/paperclip");
  });

  it("prefers repo-local .paperclip/.env over repo-root .env", async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-server-env-"));
    const packageDir = path.join(repoDir, "server");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(path.join(repoDir, ".paperclip"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, ".paperclip", "config.json"), JSON.stringify({ database: {} }, null, 2));
    fs.writeFileSync(path.join(repoDir, ".paperclip", ".env"), "DATABASE_URL=postgres://adjacent-user:adjacent-pass@localhost:6543/paperclip\n");
    fs.writeFileSync(path.join(repoDir, ".env"), "DATABASE_URL=postgres://root-user:root-pass@localhost:5432/paperclip\n");

    process.chdir(packageDir);
    const loadConfig = await importLoadConfig();

    expect(loadConfig().databaseUrl).toBe("postgres://adjacent-user:adjacent-pass@localhost:6543/paperclip");
  });
});
