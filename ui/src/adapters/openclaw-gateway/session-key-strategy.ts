export type OpenClawSessionKeyStrategy = "task_key" | "fixed" | "run";

export function normalizeOpenClawSessionKeyStrategy(
  value: unknown,
): OpenClawSessionKeyStrategy {
  if (typeof value !== "string") return "task_key";
  const normalized = value.trim().toLowerCase();
  if (normalized === "fixed" || normalized === "run") return normalized;
  if (normalized === "task_key" || normalized === "issue") return "task_key";
  return "task_key";
}
