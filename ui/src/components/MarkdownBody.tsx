import {
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Markdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import {
  Link as RouterLink,
  useInRouterContext,
  useLocation,
} from "react-router-dom";
import remarkGfm from "remark-gfm";
import {
  parseStructuredMentionHref,
  type ParsedStructuredMentionHref,
} from "@paperclipai/shared";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
} from "../lib/company-routes";
import { cn } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  /** Optional resolver for relative image paths (e.g. within export packages) */
  resolveImageSrc?: (src: string) => string | null;
  mentionMode?: "legacy" | "structured";
}

let mermaidLoaderPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidLoaderPromise;
}

function flattenText(value: ReactNode): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item)).join("");
  return "";
}

function extractMermaidSource(children: ReactNode): string | null {
  if (!isValidElement(children)) return null;
  const childProps = children.props as {
    className?: unknown;
    children?: ReactNode;
  };
  if (typeof childProps.className !== "string") return null;
  if (!/\blanguage-mermaid\b/i.test(childProps.className)) return null;
  return flattenText(childProps.children).replace(/\n$/, "");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mentionChipStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return {
    borderColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    color: luminance > 0.55 ? "#111827" : "#f8fafc",
  };
}

function structuredMentionBoardPath(parsed: ParsedStructuredMentionHref): string {
  switch (parsed.kind) {
    case "agent":
      return `/agents/${parsed.targetId}`;
    case "issue":
      return `/issues/${parsed.targetId}`;
    case "goal":
      return `/goals/${parsed.targetId}`;
    case "project":
      return `/projects/${parsed.targetId}`;
  }
}

function resolveStructuredMentionBoardHref(
  parsed: ParsedStructuredMentionHref,
  currentPathname: string | null | undefined
): string {
  const companyPrefix = currentPathname
    ? extractCompanyPrefixFromPath(currentPathname)
    : null;
  return applyCompanyPrefix(structuredMentionBoardPath(parsed), companyPrefix);
}

function StructuredMentionAnchor({
  parsed,
  children,
}: {
  parsed: ParsedStructuredMentionHref;
  children: ReactNode;
}) {
  const currentPathname =
    typeof window !== "undefined" ? window.location.pathname : null;
  const href = resolveStructuredMentionBoardHref(parsed, currentPathname);
  return (
    <a
      href={href}
      className={cn(
        "paperclip-mention-chip",
        parsed.kind === "project" && "paperclip-project-mention-chip",
      )}
      style={mentionChipStyle(parsed.color)}
    >
      {children}
    </a>
  );
}

function StructuredMentionRouterLink({
  parsed,
  children,
}: {
  parsed: ParsedStructuredMentionHref;
  children: ReactNode;
}) {
  const location = useLocation();
  const to = resolveStructuredMentionBoardHref(parsed, location.pathname);
  return (
    <RouterLink
      to={to}
      className={cn(
        "paperclip-mention-chip",
        parsed.kind === "project" && "paperclip-project-mention-chip",
      )}
      style={mentionChipStyle(parsed.color)}
    >
      {children}
    </RouterLink>
  );
}

function StructuredMentionLink({
  parsed,
  children,
}: {
  parsed: ParsedStructuredMentionHref;
  children: ReactNode;
}) {
  const inRouterContext = useInRouterContext();
  if (inRouterContext) {
    return (
      <StructuredMentionRouterLink parsed={parsed}>
        {children}
      </StructuredMentionRouterLink>
    );
  }
  return <StructuredMentionAnchor parsed={parsed}>{children}</StructuredMentionAnchor>;
}

function MermaidDiagramBlock({
  source,
  darkMode,
}: {
  source: string;
  darkMode: boolean;
}) {
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSvg(null);
    setError(null);

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: darkMode ? "dark" : "default",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        });
        const rendered = await mermaid.render(
          `paperclip-mermaid-${renderId}`,
          source,
        );
        if (!active) return;
        setSvg(rendered.svg);
      })
      .catch((err) => {
        if (!active) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to render Mermaid diagram.";
        setError(message);
      });

    return () => {
      active = false;
    };
  }, [darkMode, renderId, source]);

  return (
    <div className="paperclip-mermaid">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <>
          <p
            className={cn(
              "paperclip-mermaid-status",
              error && "paperclip-mermaid-status-error",
            )}
          >
            {error ? `Unable to render Mermaid diagram: ${error}` : "Rendering Mermaid diagram..."}
          </p>
          <pre className="paperclip-mermaid-source">
            <code className="language-mermaid">{source}</code>
          </pre>
        </>
      )}
    </div>
  );
}

function highlightMentions(children: ReactNode): ReactNode {
  if (children == null) return children;
  if (typeof children === "string") {
    const parts = children.split(/(\B@\w+)/g);
    if (parts.length <= 1) return children;
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <span key={index} className="font-medium text-primary">
          {part}
        </span>
      ) : (
        part
      ),
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={index}>{highlightMentions(child)}</Fragment>
    ));
  }
  return children;
}

export function MarkdownBody({
  children,
  className,
  resolveImageSrc,
  mentionMode = "legacy",
}: MarkdownBodyProps) {
  const { theme } = useTheme();
  const components: Components = {
    pre: ({ node: _node, children: preChildren, ...preProps }) => {
      const mermaidSource = extractMermaidSource(preChildren);
      if (mermaidSource) {
        return (
          <MermaidDiagramBlock
            source={mermaidSource}
            darkMode={theme === "dark"}
          />
        );
      }
      return <pre {...preProps}>{preChildren}</pre>;
    },
    a: ({ href, children: linkChildren }) => {
      const parsed = href ? parseStructuredMentionHref(href) : null;
      if (parsed) {
        return (
          <StructuredMentionLink parsed={parsed}>
            {linkChildren}
          </StructuredMentionLink>
        );
      }
      return (
        <a href={href} rel="noreferrer">
          {linkChildren}
        </a>
      );
    },
    p: ({ node: _node, children: pChildren, ...pProps }) => {
      return (
        <p {...pProps}>
          {mentionMode === "legacy" ? highlightMentions(pChildren) : pChildren}
        </p>
      );
    },
    li: ({ node: _node, children: liChildren, ...liProps }) => {
      return (
        <li {...liProps}>
          {mentionMode === "legacy" ? highlightMentions(liChildren) : liChildren}
        </li>
      );
    },
  };

  if (resolveImageSrc) {
    components.img = ({ node: _node, src, alt, ...imgProps }) => {
      const resolved = src ? resolveImageSrc(src) : null;
      return <img {...imgProps} src={resolved ?? src} alt={alt ?? ""} />;
    };
  }

  return (
    <div
      className={cn(
        "paperclip-markdown prose prose-xs max-w-none break-words overflow-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-all",
        theme === "dark" && "prose-invert",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          parseStructuredMentionHref(url) ? url : defaultUrlTransform(url)
        }
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
