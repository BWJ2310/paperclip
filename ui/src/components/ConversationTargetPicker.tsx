import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import type {
  ConversationActiveContextTarget,
  ConversationTargetKind,
} from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../lib/utils";

const KIND_LABELS: Record<ConversationTargetKind, string> = {
  issue: "Issue",
  goal: "Goal",
  project: "Project",
};

interface ConversationTargetPickerProps {
  companyId: string;
  onSelect: (target: ConversationActiveContextTarget) => void;
  allowedKinds?: ConversationTargetKind[];
  triggerLabel?: string;
  className?: string;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
}

export function ConversationTargetPicker({
  companyId,
  onSelect,
  allowedKinds = ["issue", "goal", "project"],
  triggerLabel = "Add context",
  className,
  buttonVariant = "outline",
}: ConversationTargetPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ConversationTargetKind>(
    allowedKinds[0] ?? "issue",
  );

  useEffect(() => {
    if (allowedKinds.includes(kind)) return;
    setKind(allowedKinds[0] ?? "issue");
  }, [allowedKinds, kind]);

  const trimmedQuery = query.trim();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["conversation-target-picker", companyId, kind, trimmedQuery],
    enabled: open && trimmedQuery.length > 0,
    queryFn: async (): Promise<ConversationActiveContextTarget[]> => {
      if (kind === "issue") {
        const issues = await issuesApi.list(companyId, { q: trimmedQuery });
        return issues.slice(0, 8).map((issue) => ({
          targetKind: "issue",
          targetId: issue.id,
          displayText: issue.identifier ?? issue.title,
        }));
      }
      if (kind === "goal") {
        const goals = await goalsApi.list(companyId, {
          q: trimmedQuery,
          limit: 8,
        });
        return goals.map((goal) => ({
          targetKind: "goal",
          targetId: goal.id,
          displayText: goal.title,
        }));
      }
      const projects = await projectsApi.list(companyId, {
        q: trimmedQuery,
        limit: 8,
      });
      return projects.map((project) => ({
        targetKind: "project",
        targetId: project.id,
        displayText: project.name,
      }));
    },
  });

  const emptyState = useMemo(() => {
    if (trimmedQuery.length === 0) {
      return "Type to search for a target.";
    }
    if (isFetching) {
      return "Searching…";
    }
    return `No ${KIND_LABELS[kind].toLowerCase()} targets found.`;
  }, [isFetching, kind, trimmedQuery.length]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={buttonVariant} size="sm" className={className}>
          <Plus className="mr-1.5 h-4 w-4" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          {allowedKinds.map((entry) => (
            <button
              key={entry}
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                entry === kind
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setKind(entry)}
            >
              {KIND_LABELS[entry]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${KIND_LABELS[kind].toLowerCase()}s...`}
            className="pl-8"
          />
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {emptyState}
            </p>
          ) : (
            results.map((target) => (
              <button
                key={`${target.targetKind}:${target.targetId}`}
                type="button"
                className="flex w-full flex-col rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                onClick={() => {
                  onSelect(target);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {KIND_LABELS[target.targetKind]}
                </span>
                <span className="mt-1 text-sm text-foreground">
                  {target.displayText}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
