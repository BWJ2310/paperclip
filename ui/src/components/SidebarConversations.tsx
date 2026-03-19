import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquare, Plus } from "lucide-react";
import { NavLink, useLocation } from "@/lib/router";
import { conversationsApi } from "../api/conversations";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function SidebarConversations() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  const { selectedCompanyId } = useCompany();
  const { openNewConversation } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();

  const { data: conversations = [] } = useQuery({
    queryKey: queryKeys.conversations.list(selectedCompanyId!),
    queryFn: () => conversationsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const conversationMatch = location.pathname.match(/^\/(?:[^/]+\/)?conversations\/([^/]+)/);
  const activeConversationId = conversationMatch?.[1] ?? null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90",
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              Conversations
            </span>
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openNewConversation();
              if (isMobile) setSidebarOpen(false);
            }}
            className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="New conversation"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {conversations.map((conversation) => (
            <NavLink
              key={conversation.id}
              to={`/conversations/${conversation.id}`}
              onClick={() => {
                if (isMobile) setSidebarOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium transition-colors",
                activeConversationId === conversation.id
                  ? "bg-accent text-foreground"
                  : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <MessageSquare className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {conversation.title}
                </span>
                <span className="max-w-[7rem] shrink-0 truncate text-[11px] font-normal text-muted-foreground">
                  {conversation.latestMessageAt
                    ? relativeTime(conversation.latestMessageAt)
                    : "No messages yet"}
                </span>
              </span>
              {conversation.unreadCount > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
