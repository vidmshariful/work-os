// Archetype to allowed navigation and capabilities. The wall itself is
// enforced in Postgres. This module only shapes what the UI offers.
import type { Archetype, WallSide } from "@/lib/types";

export type NavKey =
  | "home"
  | "tasks"
  | "todos"
  | "messages"
  | "departments"
  | "clients"
  | "projects"
  | "database"
  | "team"
  | "hr"
  | "performance"
  | "calendar"
  | "growth"
  | "admin";

export interface NavGroup {
  label: string;
  items: NavKey[];
}

const ALL_GROUPS: NavGroup[] = [
  // My Zone is the personal layer every member gets: their overview, their
  // assigned work, and their private checklist.
  { label: "My Zone", items: ["home", "tasks", "todos", "messages"] },
  { label: "Work", items: ["departments", "clients", "projects", "database"] },
  { label: "People", items: ["team", "hr"] },
  // Growth and Skills is Phase 9. Hidden in v1.
  { label: "Insight", items: ["performance", "calendar"] },
  { label: "Admin", items: ["admin"] },
];

const NAV_BY_ARCHETYPE: Record<Archetype, NavKey[]> = {
  executive: [
    "home",
    "tasks",
    "todos",
    "messages",
    "departments",
    "clients",
    "projects",
    "database",
    "team",
    "hr",
    "performance",
    "calendar",
    "admin",
  ],
  domain_manager: [
    "home",
    "tasks",
    "todos",
    "messages",
    "departments",
    "clients",
    "projects",
    "database",
    "team",
    "hr",
    "performance",
    "calendar",
  ],
  team_lead: [
    "home",
    "tasks",
    "todos",
    "messages",
    "departments",
    "clients",
    "projects",
    "database",
    "team",
    "hr",
    "performance",
    "calendar",
  ],
  contributor: [
    "home",
    "tasks",
    "todos",
    "messages",
    "departments",
    "clients",
    "projects",
    "database",
    "team",
    "hr",
    "performance",
    "calendar",
  ],
  revenue: [
    "home",
    "tasks",
    "todos",
    "messages",
    "departments",
    "clients",
    "projects",
    "database",
    "team",
    "hr",
    "performance",
    "calendar",
  ],
};

// Archetype decides what a role may reach. `enabledKeys`, when given, is the
// admin's feature switchboard from lib/data/workspace-settings.ts: turning a
// feature off in Settings removes it from the sidebar for everyone, because
// every nav surface renders from this one result.
export function navGroupsFor(
  archetype: Archetype,
  enabledKeys?: Set<string>
): NavGroup[] {
  const allowed = new Set(NAV_BY_ARCHETYPE[archetype]);
  return ALL_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter(
      (i) => allowed.has(i) && (!enabledKeys || enabledKeys.has(i))
    ),
  })).filter((g) => g.items.length > 0);
}

export interface Capabilities {
  canManageClients: boolean; // create and edit client records
  canCreateProjects: boolean;
  // Mirrors projects_delete, which is executive only. Deleting a project
  // takes its tasks, deliverables, and comments with it, so it sits a step
  // above every other project write rather than alongside them.
  canDeleteProjects: boolean;
  canAssignTasks: boolean; // create tasks and assign them
  canManageTemplates: boolean;
  canApproveLeave: boolean; // sees approval queue (leads approve their reports)
  canSeeAdmin: boolean;
  canSeeTeamPerformance: boolean;
  canSeeStudioPerformance: boolean;
  canCreateEvents: boolean;
  canPostAnnouncements: boolean;
}

export function capabilitiesFor(
  archetype: Archetype,
  wallSide: WallSide
): Capabilities {
  const isExec = archetype === "executive";
  const isDm = archetype === "domain_manager";
  const isLead = archetype === "team_lead";
  return {
    // Client writes require above wall or revenue. Enforced again server-side.
    canManageClients: wallSide === "above" || archetype === "revenue",
    canCreateProjects: isExec || isDm,
    canDeleteProjects: isExec,
    canAssignTasks: isExec || isDm || isLead,
    canManageTemplates: isExec || isDm,
    canApproveLeave: isExec || isDm || isLead,
    canSeeAdmin: isExec,
    canSeeTeamPerformance: isExec || isDm || isLead,
    canSeeStudioPerformance: isExec,
    canCreateEvents: isExec || isDm || isLead,
    canPostAnnouncements: isExec || isDm,
  };
}
