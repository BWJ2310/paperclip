import { inspectMigrations, reconcilePendingMigrationHistory } from "./client.js";
import { resolveMigrationConnection } from "./migration-runtime.js";

const jsonMode = process.argv.includes("--json");

function toError(error: unknown, context = "Migration history reconcile failed"): Error {
  if (error instanceof Error) return error;
  if (error === undefined) return new Error(context);
  if (typeof error === "string") return new Error(`${context}: ${error}`);

  try {
    return new Error(`${context}: ${JSON.stringify(error)}`);
  } catch {
    return new Error(`${context}: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  const connection = await resolveMigrationConnection();

  try {
    const before = await inspectMigrations(connection.connectionString);
    const repair = await reconcilePendingMigrationHistory(connection.connectionString);
    const after = await inspectMigrations(connection.connectionString);

    const payload = {
      source: connection.source,
      beforeStatus: before.status,
      beforePendingMigrations: before.status === "needsMigrations" ? before.pendingMigrations : [],
      repairedMigrations: repair.repairedMigrations,
      remainingMigrations: repair.remainingMigrations,
      afterStatus: after.status,
    };

    if (jsonMode) {
      console.log(JSON.stringify(payload));
      return;
    }

    if (before.status === "upToDate") {
      console.log(`Database is already up to date via ${connection.source}`);
      return;
    }

    if (repair.repairedMigrations.length > 0) {
      console.log(
        `Reconciled migration history via ${connection.source}: ${repair.repairedMigrations.join(", ")}`,
      );
    } else {
      console.log(`No migration history repairs were applied via ${connection.source}`);
    }

    if (after.status === "upToDate") {
      console.log("Database is up to date");
      return;
    }

    console.log(`Pending migrations remain: ${after.pendingMigrations.join(", ")}`);
    console.log("Run `pnpm db:migrate` to apply any remaining schema or data migrations.");
  } finally {
    await connection.stop();
  }
}

main().catch((error) => {
  const err = toError(error, "Migration history reconcile failed");
  process.stderr.write(`${err.stack ?? err.message}\n`);
  process.exit(1);
});
