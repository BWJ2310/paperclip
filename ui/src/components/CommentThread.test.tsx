import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { CommentThread } from "./CommentThread";

const slotMountCounts = new Map<string, number>();
const launcherMountCounts = new Map<string, number>();

vi.mock("react-router-dom", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ hash: "" }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock("./Identity", () => ({
  Identity: ({ name }: { name: string }) => <div>{name}</div>,
}));

vi.mock("./MarkdownBody", () => ({
  MarkdownBody: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: React.forwardRef(function MarkdownEditorMock(
    {
      value,
      onChange,
      placeholder,
    }: {
      value: string;
      onChange: (value: string) => void;
      placeholder?: string;
    },
    ref: React.ForwardedRef<HTMLTextAreaElement>,
  ) {
    return (
      <textarea
        ref={ref}
        aria-label="Comment editor"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }),
}));

vi.mock("./StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("./AgentIconPicker", () => ({
  AgentIcon: () => null,
}));

vi.mock("./InlineEntitySelector", () => ({
  InlineEntitySelector: () => null,
}));

vi.mock("../lib/utils", () => ({
  formatDateTime: () => "Jan 1, 2026",
}));

vi.mock("@/plugins/slots", () => ({
  PluginSlotMount: ({ slot }: { slot: { id: string; displayName: string } }) => {
    React.useEffect(() => {
      slotMountCounts.set(slot.id, (slotMountCounts.get(slot.id) ?? 0) + 1);
    }, [slot.id]);
    if (slot.id === "comment-empty") return null;
    return <div>{slot.displayName}</div>;
  },
}));

vi.mock("@/plugins/launchers", () => ({
  PluginLauncherButton: ({
    launcher,
  }: {
    launcher: { id: string; displayName: string };
  }) => {
    React.useEffect(() => {
      launcherMountCounts.set(launcher.id, (launcherMountCounts.get(launcher.id) ?? 0) + 1);
    }, [launcher.id]);
    return <button type="button">{launcher.displayName}</button>;
  },
}));

function createComment() {
  return {
    id: "comment-1",
    body: "Investigate plugin behavior",
    createdAt: "2026-01-01T00:00:00.000Z",
    authorAgentId: null,
  } as any;
}

function renderThread(props: Partial<React.ComponentProps<typeof CommentThread>> = {}) {
  return render(
    <CommentThread
      comments={[createComment()]}
      onAdd={vi.fn().mockResolvedValue(undefined)}
      issueId="issue-1"
      {...props}
    />,
  );
}

describe("CommentThread", () => {
  beforeEach(() => {
    slotMountCounts.clear();
    launcherMountCounts.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("mounts comment context menu slots once per comment", async () => {
    renderThread({
      commentContextMenuSlots: [{
        id: "comment-audit",
        type: "commentContextMenuItem",
        displayName: "Audit trail",
        exportName: "AuditTrailMenuItem",
        pluginId: "plugin-1",
        pluginKey: "acme.audit",
        pluginDisplayName: "Audit Plugin",
        pluginVersion: "1.0.0",
      }],
    });

    await waitFor(() => {
      expect(slotMountCounts.get("comment-audit")).toBe(1);
    });
    expect(screen.getByTitle("Comment actions")).not.toBeNull();
  });

  it("mounts comment context menu launchers once per comment", async () => {
    renderThread({
      commentContextMenuLaunchers: [{
        id: "open-audit",
        displayName: "Open audit",
        placementZone: "commentContextMenuItem",
        action: { type: "navigate", target: "/audit" },
        pluginId: "plugin-1",
        pluginKey: "acme.audit",
        pluginDisplayName: "Audit Plugin",
        pluginVersion: "1.0.0",
        uiEntryFile: "index.js",
      }],
      commentLauncherContributions: new Map([
        ["plugin-1", {
          pluginId: "plugin-1",
          pluginKey: "acme.audit",
          displayName: "Audit Plugin",
          version: "1.0.0",
          uiEntryFile: "index.js",
          slots: [],
          launchers: [],
        }],
      ]),
    });

    await waitFor(() => {
      expect(launcherMountCounts.get("open-audit")).toBe(1);
    });
    expect(screen.getByTitle("Comment actions")).not.toBeNull();
  });

  it("does not show the comment context menu button when items render nothing", async () => {
    renderThread({
      commentContextMenuSlots: [{
        id: "comment-empty",
        type: "commentContextMenuItem",
        displayName: "Hidden item",
        exportName: "HiddenItem",
        pluginId: "plugin-1",
        pluginKey: "acme.audit",
        pluginDisplayName: "Audit Plugin",
        pluginVersion: "1.0.0",
      }],
    });

    await waitFor(() => {
      expect(slotMountCounts.get("comment-empty")).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByTitle("Comment actions")).toBeNull();
    });
  });
});
