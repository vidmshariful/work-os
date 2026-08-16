import {
  Briefcase,
  Building2,
  CalendarDays,
  ChartLine,
  Database,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Plane,
  Settings2,
  SquareCheckBig,
  Users,
} from "lucide-react";
import type { NavGroup, NavKey } from "@/lib/rbac";
import type { Profile, Workspace } from "@/lib/types";
import { NavLink } from "./nav-link";
import { DepartmentTree, type DeptTreeItem } from "./department-tree";

const NAV_META: Record<
  NavKey,
  { label: string; path: string; icon: React.ReactNode; exact?: boolean }
> = {
  home: { label: "Dashboard", path: "home", icon: <LayoutDashboard /> },
  clients: { label: "Clients", path: "clients", icon: <Briefcase /> },
  projects: { label: "Projects", path: "projects", icon: <FolderKanban /> },
  database: { label: "Database", path: "database", icon: <Database /> },
  tasks: { label: "My Tasks", path: "tasks", icon: <SquareCheckBig /> },
  todos: { label: "My To-dos", path: "todos", icon: <ListTodo /> },
  messages: { label: "Messages", path: "messages", icon: <MessageSquare /> },
  departments: { label: "Spaces", path: "departments", icon: <Building2 /> },
  team: { label: "Team", path: "team", icon: <Users /> },
  hr: { label: "HR and Leave", path: "hr", icon: <Plane /> },
  performance: { label: "Performance", path: "performance", icon: <ChartLine /> },
  calendar: { label: "Calendar", path: "calendar", icon: <CalendarDays /> },
  growth: { label: "Growth and Skills", path: "growth", icon: <ChartLine /> },
  admin: { label: "Settings", path: "admin", icon: <Settings2 /> },
};

export function Sidebar({
  workspace,
  navGroups,
  myTaskCount,
  unreadMessages,
  departments,
}: {
  workspace: Workspace;
  profile: Profile;
  roleLabel: string;
  navGroups: NavGroup[];
  myTaskCount: number;
  // Unread direct messages. Without it, a message that arrives while you are
  // on another page is invisible until you happen to open Messages.
  unreadMessages: number;
  departments: DeptTreeItem[];
}) {
  // Settings moves to the bottom, pinned; it stays executive-only.
  const canSeeSettings = navGroups.some((g) => g.items.includes("admin"));
  return (
    <nav className="flex h-full w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-4 pb-2 pt-4">
        <div className="text-lead font-semibold text-text-1">{workspace.name}</div>
        <div className="text-meta text-text-3">Workspace</div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        {navGroups.map((group) => {
          const items = group.items.filter((k) => k !== "admin");
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-4">
              <div className="group-label px-2.5 pb-1.5">{group.label}</div>
              <div className="flex flex-col gap-0.5">
                {items.map((key) => {
                  if (key === "departments") {
                    return (
                      <DepartmentTree
                        key={key}
                        ws={workspace.slug}
                        departments={departments}
                      />
                    );
                  }
                  const meta = NAV_META[key];
                  return (
                    <NavLink
                      key={key}
                      href={`/${workspace.slug}/${meta.path}`}
                      label={meta.label}
                      icon={meta.icon}
                      badge={
                        key === "tasks"
                          ? myTaskCount
                          : key === "messages"
                            ? unreadMessages
                            : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {canSeeSettings ? (
        <div className="border-t border-border px-2.5 py-2.5">
          <NavLink
            href={`/${workspace.slug}/admin`}
            label="Settings"
            icon={<Settings2 />}
          />
        </div>
      ) : null}
    </nav>
  );
}

export const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  cfo: "CFO",
  ops_manager: "Operations Manager",
  creative_lead: "Creative Lead",
  marketing_manager: "Marketing Manager",
  design_lead: "Design Lead",
  animation_lead: "Animation Lead",
  editing_lead: "Video Editing Lead",
  designer: "Designer",
  animator: "Animator",
  editor: "Editor",
  marketer: "Marketing",
  closer: "Sales Closer",
  appointment_setter: "Appointment Setter",
};
