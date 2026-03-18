import type { StructuredMentionKind } from "@paperclipai/shared";

export const STRUCTURED_MENTION_PICKER_KINDS: StructuredMentionKind[] = [
  "agent",
  "issue",
  "goal",
  "project",
];

export type StructuredMentionSession =
  | {
      stage: "kind";
      kindQuery: string;
      kindOptions: StructuredMentionKind[];
    }
  | {
      stage: "entity";
      kind: StructuredMentionKind;
      entityQuery: string;
    };

function filterStructuredMentionKindOptions(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...STRUCTURED_MENTION_PICKER_KINDS];
  }

  const prefixMatches = STRUCTURED_MENTION_PICKER_KINDS.filter((kind) =>
    kind.startsWith(normalized)
  );
  if (prefixMatches.length > 0) {
    return prefixMatches;
  }

  return STRUCTURED_MENTION_PICKER_KINDS.filter((kind) =>
    kind.includes(normalized)
  );
}

export function resolveStructuredMentionSession(
  query: string
): StructuredMentionSession {
  const normalized = query.trim().toLowerCase();

  for (const kind of STRUCTURED_MENTION_PICKER_KINDS) {
    if (normalized === kind) {
      return {
        stage: "entity",
        kind,
        entityQuery: "",
      };
    }

    if (normalized.startsWith(kind) && normalized.length > kind.length) {
      return {
        stage: "entity",
        kind,
        entityQuery: query.slice(kind.length),
      };
    }
  }

  return {
    stage: "kind",
    kindQuery: query,
    kindOptions: filterStructuredMentionKindOptions(query),
  };
}
