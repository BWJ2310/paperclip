import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_INSTANCE_ID = "default";
const CONFIG_BASENAME = "config.json";
const ENV_BASENAME = ".env";
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

type PartialConfig = {
  database?: {
    mode?: "postgres";
    connectionString?: string;
  };
};

export type ResolvedDatabaseTarget =
  {
    mode: "postgres";
    connectionString: string;
    source: "DATABASE_URL" | "paperclip-env" | "project-env" | "config.database.connectionString";
    configPath: string;
    envPath: string;
  };

function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

function resolvePaperclipHomeDir(): string {
  const envHome = process.env.PAPERCLIP_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".paperclip");
}

function resolvePaperclipInstanceId(): string {
  const raw = process.env.PAPERCLIP_INSTANCE_ID?.trim() || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(`Invalid PAPERCLIP_INSTANCE_ID '${raw}'.`);
  }
  return raw;
}

function resolveDefaultConfigPath(): string {
  return path.resolve(
    resolvePaperclipHomeDir(),
    "instances",
    resolvePaperclipInstanceId(),
    CONFIG_BASENAME,
  );
}

function resolveHomeAwarePath(value: string): string {
  return path.resolve(expandHomePrefix(value));
}

function findConfigFileFromAncestors(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.resolve(currentDir, ".paperclip", CONFIG_BASENAME);
    if (existsSync(candidate)) return candidate;

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) return null;
    currentDir = nextDir;
  }
}

function hasProjectBoundary(dir: string): boolean {
  return existsSync(path.resolve(dir, "pnpm-workspace.yaml")) || existsSync(path.resolve(dir, ".git"));
}

function findProjectEnvFileFromAncestors(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.resolve(currentDir, ENV_BASENAME);
    if (existsSync(candidate)) return candidate;

    const nextDir = path.resolve(currentDir, "..");
    if (hasProjectBoundary(currentDir) || nextDir === currentDir) return null;
    currentDir = nextDir;
  }
}

function resolvePaperclipConfigPath(): string {
  if (process.env.PAPERCLIP_CONFIG?.trim()) {
    return path.resolve(process.env.PAPERCLIP_CONFIG.trim());
  }
  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}

function resolvePaperclipEnvPath(configPath: string): string {
  return path.resolve(path.dirname(configPath), ENV_BASENAME);
}

function parseEnvFile(contents: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (!value) {
      entries[key] = "";
      continue;
    }

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      entries[key] = value.slice(1, -1);
      continue;
    }

    entries[key] = value.replace(/\s+#.*$/, "").trim();
  }

  return entries;
}

function readEnvEntries(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  return parseEnvFile(readFileSync(envPath, "utf8"));
}

function readConfig(configPath: string): PartialConfig | null {
  if (!existsSync(configPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to parse config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid config at ${configPath}: expected a JSON object`);
  }

  const database =
    typeof parsed.database === "object" &&
    parsed.database !== null &&
    !Array.isArray(parsed.database)
      ? parsed.database
      : undefined;

  return {
    database: database
      ? {
          mode: "postgres",
          connectionString:
            typeof database.connectionString === "string" ? database.connectionString : undefined,
        }
      : undefined,
  };
}

export function resolveDatabaseTarget(): ResolvedDatabaseTarget {
  const configPath = resolvePaperclipConfigPath();
  const envPath = resolvePaperclipEnvPath(configPath);
  const envEntries = readEnvEntries(envPath);
  const projectEnvPath = findProjectEnvFileFromAncestors(process.cwd());
  const projectEnvEntries =
    projectEnvPath && projectEnvPath !== envPath
      ? readEnvEntries(projectEnvPath)
      : {};

  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) {
    return {
      mode: "postgres",
      connectionString: envUrl,
      source: "DATABASE_URL",
      configPath,
      envPath,
    };
  }

  const fileEnvUrl = envEntries.DATABASE_URL?.trim();
  if (fileEnvUrl) {
    return {
      mode: "postgres",
      connectionString: fileEnvUrl,
      source: "paperclip-env",
      configPath,
      envPath,
    };
  }

  const projectEnvUrl = projectEnvEntries.DATABASE_URL?.trim();
  if (projectEnvUrl) {
    return {
      mode: "postgres",
      connectionString: projectEnvUrl,
      source: "project-env",
      configPath,
      envPath: projectEnvPath!,
    };
  }

  const config = readConfig(configPath);
  const connectionString = config?.database?.connectionString?.trim();
  if (connectionString) {
    return {
      mode: "postgres",
      connectionString,
      source: "config.database.connectionString",
      configPath,
      envPath,
    };
  }

  throw new Error(
    `DATABASE_URL (or config.database.connectionString) is required. ` +
      `Checked process environment, ${envPath}, ${projectEnvPath ?? "<no repo .env found>"}, and ${configPath}.`,
  );
}
