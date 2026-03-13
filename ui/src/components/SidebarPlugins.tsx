import { useMemo } from "react";
import { useCompany } from "../context/CompanyContext";
import { SidebarSection } from "./SidebarSection";
import { PluginSlotMount, usePluginSlots } from "@/plugins/slots";

export function SidebarPlugins() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const companyPrefix = selectedCompany?.issuePrefix ?? null;
  const { slots, errorMessage } = usePluginSlots({
    slotTypes: ["sidebar"],
    companyId: selectedCompanyId,
    enabled: !!selectedCompanyId,
  });

  const context = useMemo(
    () => ({
      companyId: selectedCompanyId,
      companyPrefix,
    }),
    [companyPrefix, selectedCompanyId],
  );

  if (!selectedCompanyId) return null;

  if (errorMessage) {
    return (
      <SidebarSection label="Plugins">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
          Plugin extensions unavailable: {errorMessage}
        </div>
      </SidebarSection>
    );
  }

  if (slots.length === 0) return null;

  return (
    <SidebarSection label="Plugins">
      {slots.map((slot) => (
        <PluginSlotMount
          key={`${slot.pluginKey}:${slot.id}`}
          slot={slot}
          context={context}
          missingBehavior="hidden"
        />
      ))}
    </SidebarSection>
  );
}
