export const STRUCTURED_MENTION_KINDS = [
  "agent",
  "issue",
  "goal",
  "project",
] as const;

export type StructuredMentionKind = (typeof STRUCTURED_MENTION_KINDS)[number];

export interface ParsedStructuredMentionHref {
  kind: StructuredMentionKind;
  targetId: string;
  color: string | null;
}

export interface StructuredMentionToken extends ParsedStructuredMentionHref {
  displayText: string;
  href: string;
}

const HEX_COLOR_RE = /^[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_RE = /^[0-9a-f]{3}$/i;
const HEX_COLOR_WITH_HASH_RE = /^#[0-9a-f]{6}$/i;
const HEX_COLOR_SHORT_WITH_HASH_RE = /^#[0-9a-f]{3}$/i;
const STRUCTURED_MENTION_LINK_RE =
  /\[([^\]]*)]\(((agent|issue|goal|project):\/\/[^)\s]+)\)/gi;

function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (HEX_COLOR_WITH_HASH_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (HEX_COLOR_RE.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  if (HEX_COLOR_SHORT_WITH_HASH_RE.test(trimmed)) {
    const raw = trimmed.slice(1).toLowerCase();
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (HEX_COLOR_SHORT_RE.test(trimmed)) {
    const raw = trimmed.toLowerCase();
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return null;
}

export function buildStructuredMentionHref(
  kind: StructuredMentionKind,
  targetId: string,
  options?: { color?: string | null }
): string {
  const normalizedTargetId = targetId.trim();
  if (!normalizedTargetId) return `${kind}://`;
  if (kind !== "project") {
    return `${kind}://${normalizedTargetId}`;
  }

  const normalizedColor = normalizeHexColor(options?.color ?? null);
  if (!normalizedColor) {
    return `${kind}://${normalizedTargetId}`;
  }
  return `${kind}://${normalizedTargetId}?c=${encodeURIComponent(
    normalizedColor.slice(1)
  )}`;
}

export function parseStructuredMentionHref(
  href: string
): ParsedStructuredMentionHref | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const protocol = url.protocol.replace(/:$/, "") as StructuredMentionKind;
  if (!STRUCTURED_MENTION_KINDS.includes(protocol)) return null;

  const targetId = `${url.hostname}${url.pathname}`.replace(/^\/+/, "").trim();
  if (!targetId) return null;

  return {
    kind: protocol,
    targetId,
    color:
      protocol === "project"
        ? normalizeHexColor(
            url.searchParams.get("c") ?? url.searchParams.get("color")
          )
        : null,
  };
}

export function extractStructuredMentionTokens(
  markdown: string
): StructuredMentionToken[] {
  if (!markdown) return [];

  const tokens = new Map<string, StructuredMentionToken>();
  const regex = new RegExp(STRUCTURED_MENTION_LINK_RE);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const parsed = parseStructuredMentionHref(match[2] ?? "");
    if (!parsed) continue;
    const displayText = (match[1] ?? "").trim() || parsed.targetId;
    tokens.set(`${parsed.kind}:${parsed.targetId}`, {
      ...parsed,
      displayText,
      href: match[2] ?? "",
    });
  }

  return [...tokens.values()];
}

export function extractStructuredMentionIds(
  markdown: string,
  kind: StructuredMentionKind
): string[] {
  return extractStructuredMentionTokens(markdown)
    .filter((token) => token.kind === kind)
    .map((token) => token.targetId);
}
