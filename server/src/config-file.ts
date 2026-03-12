import fs from "node:fs";
import { paperclipConfigSchema, type PaperclipConfig } from "@paperclipai/shared";
import { resolvePaperclipConfigPath } from "./paths.js";

function injectDatabaseUrl(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;

  const config = { ...(raw as Record<string, unknown>) };
  const databaseRaw = config.database;
  if (typeof databaseRaw !== "object" || databaseRaw === null || Array.isArray(databaseRaw)) {
    return config;
  }

  const database = { ...(databaseRaw as Record<string, unknown>) };
  if (typeof database.connectionString !== "string" || database.connectionString.trim().length === 0) {
    const envConnectionString = process.env.DATABASE_URL?.trim();
    if (envConnectionString) {
      database.connectionString = envConnectionString;
    }
  }

  config.database = database;
  return config;
}

export function readConfigFile(): PaperclipConfig | null {
  const configPath = resolvePaperclipConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return paperclipConfigSchema.parse(injectDatabaseUrl(raw));
  } catch {
    return null;
  }
}
