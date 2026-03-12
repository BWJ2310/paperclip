import type { PaperclipConfig } from "../config/schema.js";
import type { CheckResult } from "./index.js";

export async function databaseCheck(config: PaperclipConfig, configPath?: string): Promise<CheckResult> {
  void configPath;
  if (!config.database.connectionString) {
    return {
      name: "Database",
      status: "fail",
      message: "PostgreSQL mode selected but no connection string configured",
      canRepair: false,
      repairHint: "Run `paperclipai configure --section database`",
    };
  }

  try {
    const { createDb } = await import("@paperclipai/db");
    const db = createDb(config.database.connectionString);
    await db.execute("SELECT 1");
    return {
      name: "Database",
      status: "pass",
      message: "PostgreSQL connection successful",
    };
  } catch (err) {
    return {
      name: "Database",
      status: "fail",
      message: `Cannot connect to PostgreSQL: ${err instanceof Error ? err.message : String(err)}`,
      canRepair: false,
      repairHint: "Check your connection string and ensure PostgreSQL is running",
    };
  }
}
