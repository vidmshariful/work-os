import { GlobalSearch } from "./global-search";
import { QuickCreate } from "./quick-create";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import type { Capabilities, NavGroup } from "@/lib/rbac";
import type { Profile, Workspace } from "@/lib/types";

export function Topbar({
  workspace,
  profile,
  roleLabel,
  capabilities,
  navGroups,
  myTaskCount,
  unreadCount,
  userId,
}: {
  workspace: Workspace;
  profile: Profile;
  roleLabel: string;
  capabilities: Capabilities;
  navGroups: NavGroup[];
  myTaskCount: number;
  unreadCount: number;
  userId: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      <MobileNav
        workspace={workspace}
        profile={profile}
        roleLabel={roleLabel}
        navGroups={navGroups}
        myTaskCount={myTaskCount}
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
      <NotificationsBell
        userId={userId}
        workspaceId={workspace.id}
        initialCount={unreadCount}
      />
      <UserMenu profile={profile} />
    </header>
  );
}
