import { resolveDatabaseTarget } from "./runtime-config.js";

export type MigrationConnection = {
  connectionString: string;
  source: string;
  stop: () => Promise<void>;
};
export async function resolveMigrationConnection(): Promise<MigrationConnection> {
  const target = resolveDatabaseTarget();
  return {
    connectionString: target.connectionString,
    source: target.source,
    stop: async () => {},
  };
}
