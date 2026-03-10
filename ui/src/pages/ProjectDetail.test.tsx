import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectDetail } from "./ProjectDetail";
import { projectsApi } from "@/api/projects";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openPanel: vi.fn(),
  closePanel: vi.fn(),
  setBreadcrumbs: vi.fn(),
  setSelectedCompanyId: vi.fn(),
  location: {
    pathname: "/projects/proj-1",
    search: "?tab=plugin%3Apaperclip-file-browser-example%3Afiles-tab&file=src%2Fcomponents%2FApp.tsx",
  },
}));

vi.mock("@/lib/router", () => ({
  useParams: () => ({ projectId: "proj-1" }),
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
  useSearchParams: () => [new URLSearchParams(mocks.location.search)],
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [],
    selectedCompanyId: "comp-1",
    setSelectedCompanyId: mocks.setSelectedCompanyId,
  }),
}));

vi.mock("@/context/PanelContext", () => ({
  usePanel: () => ({
    openPanel: mocks.openPanel,
    closePanel: mocks.closePanel,
    panelVisible: false,
    setPanelVisible: vi.fn(),
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mocks.setBreadcrumbs }),
}));

vi.mock("@/plugins/slots", () => ({
  usePluginSlots: () => ({
    slots: [{
      id: "files-tab",
      type: "detailTab",
      displayName: "Files",
      exportName: "FilesTab",
      pluginId: "plugin-1",
      pluginKey: "paperclip-file-browser-example",
      pluginDisplayName: "File Browser Example",
      pluginVersion: "1.0.0",
    }],
  }),
  PluginSlotMount: () => <div data-testid="plugin-slot-mount" />,
}));

vi.mock("@/plugins/launchers", () => ({
  PluginLauncherOutlet: () => null,
}));

vi.mock("../components/ProjectProperties", () => ({
  ProjectProperties: () => <div data-testid="project-properties" />,
}));

vi.mock("../components/InlineEditor", () => ({
  InlineEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));

vi.mock("../components/IssuesList", () => ({
  IssuesList: () => <div data-testid="issues-list" />,
}));

vi.mock("../components/PageSkeleton", () => ({
  PageSkeleton: () => <div data-testid="page-skeleton" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("lucide-react", () => ({
  SlidersHorizontal: () => <div data-testid="sliders-icon" />,
}));

vi.mock("@/api/projects", () => ({
  projectsApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectDetail />
    </QueryClientProvider>,
  );
}

describe("ProjectDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.location.pathname = "/projects/proj-1";
    mocks.location.search = "?tab=plugin%3Apaperclip-file-browser-example%3Afiles-tab&file=src%2Fcomponents%2FApp.tsx";
    vi.mocked(projectsApi.get).mockResolvedValue({
      id: "proj-1",
      urlKey: "project-1",
      name: "Project 1",
      description: null,
      status: "planned",
      targetDate: null,
      color: "#000000",
      companyId: "comp-1",
    } as Awaited<ReturnType<typeof projectsApi.get>>);
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves the file query param when canonicalizing a plugin tab URL", async () => {
    renderPage();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        "/projects/project-1?tab=plugin%3Apaperclip-file-browser-example%3Afiles-tab&file=src%2Fcomponents%2FApp.tsx",
        { replace: true },
      );
    });
  });
});
