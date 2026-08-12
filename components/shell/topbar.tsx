import { CircleHelp } from "lucide-react";
import { GlobalSearch } from "./global-search";
import { QuickCreate } from "./quick-create";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import type { DeptTreeItem } from "./department-tree";
import type { Capabilities, NavGroup } from "@/lib/rbac";
import type { Profile, Workspace } from "@/lib/types";

export function Topbar({
  workspace,
  profile,
  roleLabel,
  capabilities,
  navGroups,
  myTaskCount,
  unreadMessages,
  unreadCount,
  userId,
  departments,
}: {
  workspace: Workspace;
  profile: Profile;
  roleLabel: string;
  capabilities: Capabilities;
  navGroups: NavGroup[];
  myTaskCount: number;
  unreadMessages: number;
  unreadCount: number;
  userId: string;
  departments: DeptTreeItem[];
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <MobileNav
        workspace={workspace}
        profile={profile}
        roleLabel={roleLabel}
        navGroups={navGroups}
        myTaskCount={myTaskCount}
        unreadMessages={unreadMessages}
        departments={departments}
      />
      <div className="flex-1">
        <GlobalSearch slug={workspace.slug} workspaceId={workspace.id} />
      </div>
      <QuickCreate
        slug={workspace.slug}
        canCreateProjects={capabilities.canCreateProjects}
        canAssignTasks={capabilities.canAssignTasks}
        canManageClients={capabilities.canManageClients}
        canCreateEvents={capabilities.canCreateEvents}
      />
      <a
        href="mailto:ops@vidiosa.com?subject=Work OS help"
        aria-label="Help"
        className="flex size-9 items-center justify-center rounded-[9px] text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <CircleHelp className="size-[18px] stroke-[1.5]" />
      </a>
      <ThemeToggle className="size-9" />
      <NotificationsBell
        userId={userId}
        workspaceId={workspace.id}
        slug={workspace.slug}
        initialCount={unreadCount}
      />
      <UserMenu profile={profile} />
    </header>
  );
}
