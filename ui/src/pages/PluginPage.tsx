import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { PluginSlotMount, ensurePluginContributionLoaded } from "@/plugins/slots";

/**
 * Company-context plugin page. Renders a plugin's `page` slot at
 * `/:companyPrefix/plugins/:pluginId` when the plugin declares a page slot
 * and is enabled for that company.
 *
 * @see doc/plugins/PLUGIN_SPEC.md §19.2 — Company-Context Routes
 * @see doc/plugins/PLUGIN_SPEC.md §24.4 — Company-Context Plugin Page
 */
export function PluginPage() {
  const { companyPrefix: routeCompanyPrefix, pluginId } = useParams<{
    companyPrefix?: string;
    pluginId: string;
  }>();
  const location = useLocation();
  const { companies, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const resolvedCompanyId = useMemo(() => {
    if (!routeCompanyPrefix) return selectedCompanyId ?? null;
    const requested = routeCompanyPrefix.toUpperCase();
    return companies.find((c) => c.issuePrefix.toUpperCase() === requested)?.id ?? selectedCompanyId ?? null;
  }, [companies, routeCompanyPrefix, selectedCompanyId]);

  const companyPrefix = useMemo(
    () => (resolvedCompanyId ? companies.find((c) => c.id === resolvedCompanyId)?.issuePrefix ?? null : null),
    [companies, resolvedCompanyId],
  );

  const [pageModuleState, setPageModuleState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [pageModuleError, setPageModuleError] = useState<string | null>(null);

  const {
    data: contributions,
    isLoading: isContributionsLoading,
    error: contributionsError,
  } = useQuery({
    queryKey: queryKeys.plugins.uiContributions(resolvedCompanyId ?? undefined),
    queryFn: () => pluginsApi.listUiContributions(resolvedCompanyId ?? undefined),
    enabled: !!resolvedCompanyId && !!pluginId,
  });

  const pageContribution = useMemo(() => {
    if (!pluginId || !contributions) return null;
    return contributions.find((contribution) => contribution.pluginId === pluginId) ?? null;
  }, [contributions, pluginId]);

  const pageSlot = useMemo(() => {
    if (!pageContribution) return null;
    const slot = pageContribution.slots.find((candidate) => candidate.type === "page");
    if (!slot) return null;
    return {
      ...slot,
      pluginId: pageContribution.pluginId,
      pluginKey: pageContribution.pluginKey,
      pluginDisplayName: pageContribution.displayName,
      pluginVersion: pageContribution.version,
    };
  }, [pageContribution]);

  const context = useMemo(
    () => ({
      companyId: resolvedCompanyId ?? null,
      companyPrefix,
      locationSearch: location.search,
      locationPathname: location.pathname,
    }),
    [companyPrefix, location.pathname, location.search, resolvedCompanyId],
  );

  useEffect(() => {
    if (pageSlot) {
      setBreadcrumbs([
        { label: "Plugins", href: companyPrefix ? `/${companyPrefix}/settings/plugins` : "/settings/plugins" },
        { label: pageSlot.pluginDisplayName },
      ]);
    }
  }, [pageSlot, companyPrefix, setBreadcrumbs]);

  useEffect(() => {
    if (!pageContribution || !pageSlot) {
      setPageModuleState("idle");
      setPageModuleError(null);
      return;
    }

    let cancelled = false;
    setPageModuleState("loading");
    setPageModuleError(null);

    void ensurePluginContributionLoaded(pageContribution)
      .then(() => {
        if (!cancelled) setPageModuleState("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPageModuleState("error");
        setPageModuleError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [pageContribution, pageSlot]);

  if (!resolvedCompanyId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Select a company to view this page.</p>
      </div>
    );
  }

  if (isContributionsLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (contributionsError) {
    return (
      <div className="text-sm text-destructive">
        Failed to load plugin page.
      </div>
    );
  }

  if (!pageSlot) {
    // No page slot: redirect to plugin settings where plugin info is always shown
    const settingsPath = companyPrefix ? `/${companyPrefix}/settings/plugins/${pluginId}` : `/settings/plugins/${pluginId}`;
    return <Navigate to={settingsPath} replace />;
  }

  if (pageModuleState !== "loaded") {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Loading…</div>
        {pageModuleState === "error" && pageModuleError && (
          <div className="text-xs text-destructive">{pageModuleError}</div>
        )}
      </div>
    );
  }

  return (
    <PluginSlotMount
      slot={pageSlot}
      context={context}
      className="min-h-[200px]"
      missingBehavior="placeholder"
    />
  );
}
