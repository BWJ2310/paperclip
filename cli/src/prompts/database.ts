import * as p from "@clack/prompts";
import type { DatabaseConfig } from "../config/schema.js";
import {
  resolveDefaultBackupDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";

export async function promptDatabase(current?: DatabaseConfig): Promise<DatabaseConfig> {
  const instanceId = resolvePaperclipInstanceId();
  const defaultBackupDir = resolveDefaultBackupDir(instanceId);
  const base: DatabaseConfig = current ?? {
    mode: "postgres",
    connectionString: process.env.DATABASE_URL?.trim() || "",
    backup: {
      enabled: true,
      intervalMinutes: 60,
      retentionDays: 30,
      dir: defaultBackupDir,
    },
  };

  const connectionString = await p.text({
    message: "PostgreSQL connection string",
    defaultValue: base.connectionString ?? "",
    placeholder: "postgres://user:pass@localhost:5432/paperclip",
    validate: (val) => {
      if (!val || val.trim().length === 0) return "Connection string is required";
      if (!val.startsWith("postgres")) return "Must be a postgres:// or postgresql:// URL";
      return undefined;
    },
  });
  if (p.isCancel(connectionString)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const backupEnabled = await p.confirm({
    message: "Enable automatic database backups?",
    initialValue: base.backup.enabled,
  });
  if (p.isCancel(backupEnabled)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const backupDirInput = await p.text({
    message: "Backup directory",
    defaultValue: base.backup.dir || defaultBackupDir,
    placeholder: defaultBackupDir,
    validate: (val) => (!val || val.trim().length === 0 ? "Backup directory is required" : undefined),
  });
  if (p.isCancel(backupDirInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const backupIntervalInput = await p.text({
    message: "Backup interval (minutes)",
    defaultValue: String(base.backup.intervalMinutes || 60),
    placeholder: "60",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return "Interval must be a positive integer";
      if (n > 10080) return "Interval must be 10080 minutes (7 days) or less";
      return undefined;
    },
  });
  if (p.isCancel(backupIntervalInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const backupRetentionInput = await p.text({
    message: "Backup retention (days)",
    defaultValue: String(base.backup.retentionDays || 30),
    placeholder: "30",
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) return "Retention must be a positive integer";
      if (n > 3650) return "Retention must be 3650 days or less";
      return undefined;
    },
  });
  if (p.isCancel(backupRetentionInput)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  return {
    mode: "postgres",
    connectionString,
    backup: {
      enabled: backupEnabled,
      intervalMinutes: Number(backupIntervalInput || "60"),
      retentionDays: Number(backupRetentionInput || "30"),
      dir: backupDirInput || defaultBackupDir,
    },
  };
}
