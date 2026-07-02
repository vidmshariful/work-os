import Link from "next/link";
import {
  Briefcase,
  CalendarDays,
  ChartLine,
  CircleHelp,
  FolderKanban,
  House,
  Plane,
  Settings2,
  SquareCheckBig,
  Users,
} from "lucide-react";
import type { NavGroup, NavKey } from "@/lib/rbac";
import type { Profile, Workspace } from "@/lib/types";
import { NavLink } from "./nav-link";
import { PersonAvatar } from "@/components/primitives/avatar";

const NAV_META: Record<
  NavKey,
  { label: string; path: string; icon: React.ReactNode; exact?: boolean }
> = {
  home: { label: "Home", path: "home", icon: <House /> },
  clients: { label: "Clients", path: "clients", icon: <Briefcase /> },
  projects: { label: "Projects", path: "projects", icon: <FolderKanban /> },
  tasks: { label: "My Tasks", path: "tasks", icon: <SquareCheckBig /> },
  team: { label: "Team", path: "team", icon: <Users /> },
  hr: { label: "HR and Leave", path: "hr", icon: <Plane /> },
  performance: { label: "Performance", path: "performance", icon: <ChartLine /> },
  calendar: { label: "Calendar", path: "calendar", icon: <CalendarDays /> },
  growth: { label: "Growth and Skills", path: "growth", icon: <ChartLine /> },
  admin: { label: "Settings", path: "admin", icon: <Settings2 /> },
};

export function Sidebar({
  workspace,
  profile,
  roleLabel,
  navGroups,
  myTaskCount,
}: {
  workspace: Workspace;
  profile: Profile;
  roleLabel: string;
  navGroups: NavGroup[];
  myTaskCount: number;
}) {
  return (
    <nav className="flex h-full w-[228px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-4 pb-2 pt-4">
        <div className="text-[15px] font-semibold text-text-1">{workspace.name}</div>
        <div className="text-[12px] text-text-3">Workspace</div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="group-label px-2.5 pb-1.5">{group.label}</div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((key) => {
                const meta = NAV_META[key];
                return (
                  <NavLink
                    key={key}
                    href={`/${workspace.slug}/${meta.path}`}
                    label={meta.label}
                    icon={meta.icon}
                    badge={key === "tasks" ? myTaskCount : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-2.5 py-2.5">
        <Link
          href="/account"
          className="flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-surface-2"
        >
          <PersonAvatar name={profile.full_name} src={profile.avatar_url} size={30} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-text-1">
              {profile.full_name}
            </span>
            <span className="block truncate text-[11.5px] text-text-3">{roleLabel}</span>
          </span>
        </Link>
        <a
          href="mailto:ops@vidiosa.com?subject=Work OS help"
          className="mt-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-sm font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
        >
          <CircleHelp className="size-[18px] stroke-[1.5]" />
          Help
        </a>
      </div>
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
