import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";

vi.mock("@/api/plugins", () => ({
  pluginsApi: {
    bridgeGetData: vi.fn(),
    bridgePerformAction: vi.fn(),
  },
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    getSession: vi.fn().mockResolvedValue({
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "test@example.com", name: "Test User" },
    }),
  },
}));

import { pluginsApi } from "@/api/plugins";
import {
  usePluginData,
  usePluginAction,
  useHostContext,
} from "./bridge";
import {
  PluginSlotMount,
  registerPluginReactComponent,
  _resetPluginModuleLoader,
  type ResolvedPluginSlot,
} from "./slots";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = createTestQueryClient();
  const wrappedNode = (n: ReactNode) => (
    <QueryClientProvider client={queryClient}>{n}</QueryClientProvider>
  );
  act(() => {
    root.render(wrappedNode(node));
  });
  return {
    container,
    rerender: (next: ReactNode) =>
      act(() => {
        root.render(wrappedNode(next));
      }),
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

async function flushBridgeUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function BridgeProbe() {
  const { data, loading, error } = usePluginData<{ value: string }>(
    "workspaces",
    { projectId: "project-1" },
  );

  return (
    <div data-testid="bridge-probe-status">
      {loading ? "loading" : error ? `error:${error.code}` : (data?.value ?? "none")}
    </div>
  );
}

const slot: ResolvedPluginSlot = {
  id: "files-tab",
  type: "detailTab",
  displayName: "Files",
  exportName: "BridgeProbe",
  entityTypes: ["project"],
  pluginId: "plugin-1",
  pluginKey: "acme.files",
  pluginDisplayName: "Acme Files",
  pluginVersion: "1.0.0",
};

const baseContext = {
  entityId: "project-1",
  entityType: "project" as const,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  _resetPluginModuleLoader();
  document.body.innerHTML = "";
});

describe("plugin bridge regressions", () => {
  it("re-fetches plugin data when company context becomes available after initial mount", async () => {
    registerPluginReactComponent("acme.files", "BridgeProbe", BridgeProbe);
    vi.mocked(pluginsApi.bridgeGetData)
      .mockResolvedValueOnce({ data: { value: "no-company" } })
      .mockResolvedValueOnce({ data: { value: "with-company" } });

    const view = renderNode(
      <PluginSlotMount
        slot={slot}
        context={{ ...baseContext, companyId: null }}
      />,
    );

    await flushBridgeUpdates();

    expect(pluginsApi.bridgeGetData).toHaveBeenCalledTimes(1);
    expect(pluginsApi.bridgeGetData).toHaveBeenNthCalledWith(
      1,
      "plugin-1",
      "workspaces",
      { projectId: "project-1" },
      null,
      null,
    );
    expect(view.container.querySelector("[data-testid='bridge-probe-status']")?.textContent).toBe("no-company");

    view.rerender(
      <PluginSlotMount
        slot={slot}
        context={{ ...baseContext, companyId: "company-1" }}
      />,
    );

    await flushBridgeUpdates();

    expect(pluginsApi.bridgeGetData).toHaveBeenCalledTimes(2);
    expect(pluginsApi.bridgeGetData).toHaveBeenNthCalledWith(
      2,
      "plugin-1",
      "workspaces",
      { projectId: "project-1" },
      "company-1",
      null,
    );
    expect(view.container.querySelector("[data-testid='bridge-probe-status']")?.textContent).toBe("with-company");
    view.unmount();
  });

  it("retries transient WORKER_UNAVAILABLE bridge errors without requiring remount", async () => {
    vi.useFakeTimers();
    registerPluginReactComponent("acme.files", "BridgeProbe", BridgeProbe);
    vi.mocked(pluginsApi.bridgeGetData)
      .mockRejectedValueOnce(
        new ApiError("worker not ready", 502, {
          code: "WORKER_UNAVAILABLE",
          message: "Plugin worker is starting",
        }),
      )
      .mockResolvedValueOnce({ data: { value: "ready" } });

    const view = renderNode(
      <PluginSlotMount
        slot={slot}
        context={{ ...baseContext, companyId: "company-1" }}
      />,
    );

    await flushBridgeUpdates();
    expect(pluginsApi.bridgeGetData).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await flushBridgeUpdates();

    expect(pluginsApi.bridgeGetData).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector("[data-testid='bridge-probe-status']")?.textContent).toBe("ready");
    view.unmount();
  });
});

describe("usePluginAction", () => {
  it("calls bridgePerformAction and returns the result", async () => {
    vi.mocked(pluginsApi.bridgePerformAction).mockResolvedValueOnce({
      data: { success: true },
    });

    let actionFn: ((params?: Record<string, unknown>) => Promise<unknown>) | null = null;

    function ActionProbe() {
      const action = usePluginAction("submit");
      actionFn = action;
      return <div data-testid="action-probe">ready</div>;
    }

    registerPluginReactComponent("acme.files", "ActionProbe", ActionProbe);
    const actionSlot = { ...slot, exportName: "ActionProbe" };

    const view = renderNode(
      <PluginSlotMount
        slot={actionSlot}
        context={{ ...baseContext, companyId: "company-1" }}
      />,
    );

    await flushBridgeUpdates();
    expect(view.container.querySelector("[data-testid='action-probe']")?.textContent).toBe("ready");
    expect(actionFn).not.toBeNull();

    let result: unknown;
    await act(async () => {
      result = await actionFn!({ key: "value" });
    });

    expect(result).toEqual({ success: true });
    expect(pluginsApi.bridgePerformAction).toHaveBeenCalledWith(
      "plugin-1",
      "submit",
      { key: "value" },
      "company-1",
      null,
    );
    view.unmount();
  });

  it("throws a structured PluginBridgeError on failure", async () => {
    vi.mocked(pluginsApi.bridgePerformAction).mockRejectedValueOnce(
      new ApiError("denied", 403, {
        code: "CAPABILITY_DENIED",
        message: "Missing capability: issues.create",
      }),
    );

    let actionFn: ((params?: Record<string, unknown>) => Promise<unknown>) | null = null;

    function ActionErrorProbe() {
      const action = usePluginAction("create-issue");
      actionFn = action;
      return <div>ready</div>;
    }

    registerPluginReactComponent("acme.files", "ActionErrorProbe", ActionErrorProbe);
    const actionSlot = { ...slot, exportName: "ActionErrorProbe" };

    const view = renderNode(
      <PluginSlotMount
        slot={actionSlot}
        context={{ ...baseContext, companyId: "company-1" }}
      />,
    );

    await flushBridgeUpdates();

    let caughtError: unknown;
    await act(async () => {
      try {
        await actionFn!();
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({
      code: "CAPABILITY_DENIED",
      message: "Missing capability: issues.create",
    });
    view.unmount();
  });
});

describe("useHostContext", () => {
  it("returns the host context from the enclosing bridge scope", async () => {
    let captured: ReturnType<typeof useHostContext> | null = null;

    function HostContextProbe() {
      captured = useHostContext();
      return <div data-testid="host-ctx">ok</div>;
    }

    registerPluginReactComponent("acme.files", "HostContextProbe", HostContextProbe);
    const ctxSlot = { ...slot, exportName: "HostContextProbe" };

    const view = renderNode(
      <PluginSlotMount
        slot={ctxSlot}
        context={{
          companyId: "company-1",
          companyPrefix: "ACME",
          entityId: "project-1",
          entityType: "project" as const,
        }}
      />,
    );

    await flushBridgeUpdates();

    expect(captured).not.toBeNull();
    expect(captured!.companyId).toBe("company-1");
    expect(captured!.companyPrefix).toBe("ACME");
    expect(captured!.entityId).toBe("project-1");
    expect(captured!.entityType).toBe("project");
    // projectId should be inferred from entityType === "project"
    expect(captured!.projectId).toBe("project-1");
    view.unmount();
  });
});

describe("bridge hooks outside provider", () => {
  it("usePluginData throws when used outside PluginBridgeContext", () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    function Orphan() {
      usePluginData("test");
      return <div>should not render</div>;
    }

    try {
      expect(() => {
        renderNode(<Orphan />);
      }).toThrow(
        /Plugin bridge hook called outside of a <PluginBridgeContext\.Provider>/,
      );
    } finally {
      console.error = originalError;
    }
  });

  it("usePluginAction throws when used outside PluginBridgeContext", () => {
    const originalError = console.error;
    console.error = () => {};

    function Orphan() {
      usePluginAction("test");
      return <div>should not render</div>;
    }

    try {
      expect(() => {
        renderNode(<Orphan />);
      }).toThrow(
        /Plugin bridge hook called outside of a <PluginBridgeContext\.Provider>/,
      );
    } finally {
      console.error = originalError;
    }
  });

  it("useHostContext throws when used outside PluginBridgeContext", () => {
    const originalError = console.error;
    console.error = () => {};

    function Orphan() {
      useHostContext();
      return <div>should not render</div>;
    }

    try {
      expect(() => {
        renderNode(<Orphan />);
      }).toThrow(
        /Plugin bridge hook called outside of a <PluginBridgeContext\.Provider>/,
      );
    } finally {
      console.error = originalError;
    }
  });
});
