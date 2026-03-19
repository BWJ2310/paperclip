import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = { ...process.env };

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function restoreProcessEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function unsetTestEnv(keys: string[]) {
  for (const key of keys) {
    delete process.env[key];
  }
}

async function importConfigModule() {
  vi.resetModules();
  return await import("../config.ts");
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  restoreProcessEnv();
  vi.resetModules();
});

describe("loadConfig env loading", () => {
  it("loads the nearest ancestor .env when launched from the server workspace", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-server-config-"));
    const repoDir = path.join(tempDir, "repo");
    const serverDir = path.join(repoDir, "server");
    const instanceDir = path.join(tempDir, "instance");
    fs.mkdirSync(serverDir, { recursive: true });

    writeText(
      path.join(repoDir, ".env"),
      [
        "PAPERCLIP_DEPLOYMENT_MODE=authenticated",
        "HOST=localhost",
        "PORT=4100",
        "",
      ].join("\n"),
    );
    writeText(path.join(instanceDir, ".env"), "PAPERCLIP_AGENT_JWT_SECRET=test-secret\n");

    unsetTestEnv([
      "PAPERCLIP_DEPLOYMENT_MODE",
      "HOST",
      "PORT",
      "PAPERCLIP_HOME",
      "PAPERCLIP_INSTANCE_ID",
    ]);
    process.env.PAPERCLIP_CONFIG = path.join(instanceDir, "config.json");
    process.chdir(serverDir);

    const { loadConfig } = await importConfigModule();
    const config = loadConfig();

    expect(config.deploymentMode).toBe("authenticated");
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(4100);
  });

  it("keeps the ancestor repo .env value for overlapping keys", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-server-config-"));
    const repoDir = path.join(tempDir, "repo");
    const serverDir = path.join(repoDir, "server");
    const instanceDir = path.join(tempDir, "instance");
    fs.mkdirSync(serverDir, { recursive: true });

    writeText(path.join(repoDir, ".env"), "PAPERCLIP_DEPLOYMENT_MODE=authenticated\n");
    writeText(
      path.join(instanceDir, ".env"),
      [
        "PAPERCLIP_DEPLOYMENT_MODE=local_trusted",
        "PAPERCLIP_AGENT_JWT_SECRET=test-secret",
        "",
      ].join("\n"),
    );

    unsetTestEnv([
      "PAPERCLIP_DEPLOYMENT_MODE",
      "PAPERCLIP_HOME",
      "PAPERCLIP_INSTANCE_ID",
    ]);
    process.env.PAPERCLIP_CONFIG = path.join(instanceDir, "config.json");
    process.chdir(serverDir);

    const { loadConfig } = await importConfigModule();
    const config = loadConfig();

    expect(config.deploymentMode).toBe("authenticated");
  });
});
