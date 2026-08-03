// The filter and sort contract for a space, shared by the page that applies
// it and the control bar that writes it. Param names live here once so the
// server and the bar cannot drift apart.
//
// Filtering runs on the server inside the page, so none of this logic ships
// to the browser. The bar only rewrites the query string.
import {
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { daysUntil } from "@/lib/format";
import { isOverdue } from "@/components/features/projects/due-date";
import type { CompletionMap, ProjectWithOwner } from "@/components/features/projects/types";
import type { ProjectStatus } from "@/lib/types";

export const PARAM = {
  q: "q",
  status: "status",
  assignee: "assignee",
  due: "due",
  list: "list",
  sort: "sort",
  dir: "dir",
  view: "view",
  group: "group",
} as const;

export const GROUP_CHOICES = [
  { value: "list", label: "List" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "due", label: "Due date" },
  { value: "none", label: "None" },
] as const;

export type GroupKey = (typeof GROUP_CHOICES)[number]["value"];

// Sub-projects nest only where the grouping keeps a parent and its children
// together. Group by status or assignee and a child can legitimately sit in a
// different section from its parent, so there nothing nests and each child
// carries a breadcrumb instead.
export function groupNests(group: GroupKey): boolean {
  return group === "list" || group === "none";
}

export const STATUS_CHOICES: { value: ProjectStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "delivered", label: "Delivered" },
];

export const DUE_CHOICES = [
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "none", label: "No date" },
] as const;

export type DueChoice = (typeof DUE_CHOICES)[number]["value"];

export const SORT_CHOICES = [
  { value: "due", label: "Due date" },
  { value: "title", label: "Title" },
  { value: "code", label: "Project code" },
  { value: "list", label: "List" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "updated", label: "Last updated" },
  { value: "progress", label: "Progress" },
] as const;

export type SortKey = (typeof SORT_CHOICES)[number]["value"];

// Unassigned and unlisted are real choices, not the absence of one, so they
// travel as explicit sentinel values.
export const UNASSIGNED = "unassigned";
export const NO_LIST = "none";

export interface SpaceFilters {
  q: string;
  status: string[];
  assignee: string[];
  due: DueChoice | null;
  list: string[];
  sort: SortKey;
  dir: "asc" | "desc";
  group: GroupKey;
}

const csv = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseSpaceFilters(
  sp: Record<string, string | string[] | undefined>
): SpaceFilters {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const due = one(PARAM.due);
  const sort = one(PARAM.sort);
  const group = one(PARAM.group);
  // The overdue pill shipped before this bar existed. Keep its old link
  // working by folding it into the due filter.
  const legacyOverdue = one("overdue") === "1";

  return {
    q: (one(PARAM.q) ?? "").trim(),
    status: csv(one(PARAM.status)).filter((s) =>
      STATUS_CHOICES.some((c) => c.value === s)
    ),
    assignee: csv(one(PARAM.assignee)),
    due: DUE_CHOICES.some((c) => c.value === due)
      ? (due as DueChoice)
      : legacyOverdue
        ? "overdue"
        : null,
    list: csv(one(PARAM.list)),
    sort: SORT_CHOICES.some((c) => c.value === sort) ? (sort as SortKey) : "due",
    dir: one(PARAM.dir) === "desc" ? "desc" : "asc",
    // The URL always wins. A stored preference is only consulted when the
    // parameter is absent, which is what makes a shared link predictable.
    group: GROUP_CHOICES.some((c) => c.value === group)
      ? (group as GroupKey)
      : "list",
  };
}

// True when the reader arrived without an explicit choice, so a stored
// preference may be applied.
export function hasExplicitGroup(
  sp: Record<string, string | string[] | undefined>
): boolean {
  const v = sp[PARAM.group];
  const one = Array.isArray(v) ? v[0] : v;
  return GROUP_CHOICES.some((c) => c.value === one);
}

// Sort is not a filter, so it never counts toward the badge or Clear all.
export function activeFilterCount(f: SpaceFilters): number {
  return (
    (f.q ? 1 : 0) +
    f.status.length +
    f.assignee.length +
    (f.due ? 1 : 0) +
    f.list.length
  );
}

export const VIEW_CHOICES = ["list", "board", "table", "calendar"] as const;
export type SpaceView = (typeof VIEW_CHOICES)[number];

export function parseView(v: string | string[] | undefined): SpaceView {
  const one = Array.isArray(v) ? v[0] : v;
  return VIEW_CHOICES.includes(one as SpaceView) ? (one as SpaceView) : "list";
}

// True when the URL named a view, which is what lets a shared link beat a
// stored preference.
export function hasExplicitView(
  sp: Record<string, string | string[] | undefined>
): boolean {
  const v = sp[PARAM.view];
  const one = Array.isArray(v) ? v[0] : v;
  return VIEW_CHOICES.includes(one as SpaceView);
}

// The view and the grouping are both remembered per person, and both keep
// their default out of the URL. Those two decisions fight each other, and
// this is the referee.
//
// The bug it exists to stop: List is the default view, so buildSpaceQuery
// omits it, so clicking the List tab produces a URL with no view at all.
// Read naively that looks identical to arriving cold with no preference,
// so the restore would send the person straight back to whatever they had
// stored. Once anything else was remembered, List became unreachable. The
// same held for grouping by list.
//
// The distinction that fixes it is arrival. Restoring a remembered choice is
// something you do when someone turns up with no opinion, not every time
// they click a tab. Returns the value to redirect to, or null to stay put.
export function restoreTarget({
  current,
  stored,
  explicitInUrl,
  isArrival,
  choices,
}: {
  current: string;
  stored: string | null;
  // Whether the URL named a choice. A default choice is absent by design,
  // so this is false both for "chose the default" and for "chose nothing".
  explicitInUrl: boolean;
  // First render since this page was arrived at, as opposed to a navigation
  // within it.
  isArrival: boolean;
  choices: readonly string[];
}): string | null {
  // The URL is authoritative, so a shared link always wins.
  if (explicitInUrl) return null;
  // Absent after arrival means the person picked the default on purpose.
  if (!isArrival) return null;
  if (!stored || stored === current) return null;
  if (!choices.includes(stored)) return null;
  return stored;
}

export function buildSpaceQuery(
  f: Partial<SpaceFilters> & { view?: string }
): string {
  const p = new URLSearchParams();
  // List is the fallback everywhere, so it stays out of the URL.
  if (f.view && f.view !== "list") p.set(PARAM.view, f.view);
  if (f.q) p.set(PARAM.q, f.q);
  if (f.status?.length) p.set(PARAM.status, f.status.join(","));
  if (f.assignee?.length) p.set(PARAM.assignee, f.assignee.join(","));
  if (f.due) p.set(PARAM.due, f.due);
  if (f.list?.length) p.set(PARAM.list, f.list.join(","));
  // Due ascending is the default view, so it stays out of the URL.
  if (f.sort && f.sort !== "due") p.set(PARAM.sort, f.sort);
  if (f.dir === "desc") p.set(PARAM.dir, "desc");
  if (f.group && f.group !== "list") p.set(PARAM.group, f.group);
  return p.toString();
}

function matchesDue(
  p: ProjectWithOwner,
  due: DueChoice,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): boolean {
  if (due === "none") return !p.due_date;
  if (!p.due_date) return false;
  if (due === "overdue") return isOverdue(p.due_date, p.status);

  const d = parseISO(p.due_date);
  const now = new Date();
  const from = due === "week" ? startOfWeek(now, { weekStartsOn }) : startOfMonth(now);
  const to = due === "week" ? endOfWeek(now, { weekStartsOn }) : endOfMonth(now);
  return d >= from && d <= to;
}

function matchesOne(
  p: ProjectWithOwner,
  f: SpaceFilters,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!p.title.toLowerCase().includes(q) && !p.code.toLowerCase().includes(q)) {
      return false;
    }
  }
  if (f.status.length && !f.status.includes(p.status)) return false;
  if (f.assignee.length) {
    const key = p.owner_id ?? UNASSIGNED;
    if (!f.assignee.includes(key)) return false;
  }
  if (f.list.length) {
    const key = p.list_id ?? NO_LIST;
    if (!f.list.includes(key)) return false;
  }
  if (f.due && !matchesDue(p, f.due, weekStartsOn)) return false;
  return true;
}

const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  in_progress: 1,
  review: 2,
  delivered: 3,
  archived: 4,
};

// Nulls always sort last regardless of direction: a project with no due date
// is not "earliest", it is simply undated.
function compare(
  a: ProjectWithOwner,
  b: ProjectWithOwner,
  f: SpaceFilters,
  completion: CompletionMap,
  listNames: Map<string, string>
): number {
  const sign = f.dir === "desc" ? -1 : 1;
  switch (f.sort) {
    case "title":
      return sign * a.title.localeCompare(b.title);
    case "list": {
      // No list sorts last either way, like any other empty value.
      const la = a.list_id ? listNames.get(a.list_id) ?? "" : null;
      const lb = b.list_id ? listNames.get(b.list_id) ?? "" : null;
      if (la === null && lb === null) return a.code.localeCompare(b.code);
      if (la === null) return 1;
      if (lb === null) return -1;
      return sign * la.localeCompare(lb);
    }
    case "assignee": {
      const na = a.owner?.full_name ?? null;
      const nb = b.owner?.full_name ?? null;
      if (na === null && nb === null) return a.code.localeCompare(b.code);
      if (na === null) return 1;
      if (nb === null) return -1;
      return sign * na.localeCompare(nb);
    }
    case "code":
      return sign * a.code.localeCompare(b.code, undefined, { numeric: true });
    case "status":
      return sign * ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    case "updated":
      return sign * (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
    case "progress": {
      const frac = (p: ProjectWithOwner) => {
        const c = completion[p.id];
        return c && c.total > 0 ? c.done / c.total : 0;
      };
      return sign * (frac(a) - frac(b));
    }
    case "due":
    default: {
      if (!a.due_date && !b.due_date) return a.code.localeCompare(b.code);
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      const da = daysUntil(a.due_date) ?? 0;
      const db = daysUntil(b.due_date) ?? 0;
      return sign * (da - db);
    }
  }
}

export interface FilteredSpace {
  // Everything to render, parents and children together.
  visible: ProjectWithOwner[];
  // Parents included only because a child matched. Rendered dimmed.
  contextIds: Set<string>;
  matchedCount: number;
}

// A parent is never hidden while one of its children matches, otherwise the
// child would appear with no context, or vanish entirely in a nested list.
// Such a parent comes back as context and is dimmed, so it reads as scaffolding
// rather than as a result.
export function applySpaceFilters(
  projects: ProjectWithOwner[],
  f: SpaceFilters,
  completion: CompletionMap,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1,
  // Sorting by list compares names, not ids, so the caller supplies them.
  listNames: Map<string, string> = new Map()
): FilteredSpace {
  const active = activeFilterCount(f) > 0;
  const byId = new Map(projects.map((p) => [p.id, p]));

  const matched = active
    ? projects.filter((p) => matchesOne(p, f, weekStartsOn))
    : projects;
  const matchedIds = new Set(matched.map((p) => p.id));

  const contextIds = new Set<string>();
  if (active) {
    for (const p of matched) {
      if (!p.parent_project_id || matchedIds.has(p.parent_project_id)) continue;
      const parent = byId.get(p.parent_project_id);
      if (parent) contextIds.add(parent.id);
    }
  }

  const visible = [
    ...matched,
    ...[...contextIds].map((id) => byId.get(id)!).filter(Boolean),
  ].sort((a, b) => compare(a, b, f, completion, listNames));

  return { visible, contextIds, matchedCount: matched.length };
}

// ---- grouping ----

export interface ProjectGroup {
  key: string;
  label: string;
  items: ProjectWithOwner[];
  // Only list groups carry an anchor and per-list actions.
  listId?: string;
}

// Buckets mirror the urgency rules already used on every row, so a project
// coloured red sits under Overdue and one coloured amber sits under Today or
// Next 3 days. One idea of lateness, not two.
const DUE_BUCKETS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "soon", label: "Next 3 days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
] as const;

function dueBucket(p: ProjectWithOwner): string {
  if (!p.due_date) return "none";
  if (isOverdue(p.due_date, p.status)) return "overdue";
  const d = daysUntil(p.due_date);
  if (d === null) return "none";
  if (d === 0) return "today";
  if (d <= 3 && d > 0) return "soon";
  return "later";
}

// Item order inside every group is the order applySpaceFilters produced, so
// the sort control still governs within a section.
export function groupProjects(
  projects: ProjectWithOwner[],
  group: GroupKey,
  lists: { id: string; name: string }[]
): ProjectGroup[] {
  if (group === "none") {
    return [{ key: "all", label: "All projects", items: projects }];
  }

  if (group === "list") {
    const groups: ProjectGroup[] = lists.map((l) => ({
      key: l.id,
      listId: l.id,
      label: l.name,
      items: projects.filter((p) => p.list_id === l.id),
    }));
    // Unlisted is always rendered, empty or not, so nobody has to guess
    // whether the bucket exists before filing something into it.
    groups.push({
      key: NO_LIST,
      label: lists.length > 0 ? "Unlisted" : "Projects",
      items: projects.filter((p) => !p.list_id),
    });
    return groups;
  }

  if (group === "status") {
    // Pipeline order, not alphabetical: Backlog reads before Delivered.
    return STATUS_CHOICES.map((s) => ({
      key: s.value,
      label: s.label,
      items: projects.filter((p) => p.status === s.value),
    })).filter((g) => g.items.length > 0);
  }

  if (group === "due") {
    return DUE_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      items: projects.filter((p) => dueBucket(p) === b.key),
    })).filter((g) => g.items.length > 0);
  }

  // Assignee: named owners first, alphabetically, with Unassigned last so it
  // reads as the leftovers rather than as a person called U.
  const owners = new Map<string, { label: string; items: ProjectWithOwner[] }>();
  const unassigned: ProjectWithOwner[] = [];
  for (const p of projects) {
    if (!p.owner) {
      unassigned.push(p);
      continue;
    }
    const entry = owners.get(p.owner.id) ?? { label: p.owner.full_name, items: [] };
    entry.items.push(p);
    owners.set(p.owner.id, entry);
  }
  const groups: ProjectGroup[] = [...owners.entries()]
    .map(([id, v]) => ({ key: id, label: v.label, items: v.items }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (unassigned.length > 0) {
    groups.push({ key: UNASSIGNED, label: "Unassigned", items: unassigned });
  }
  return groups;
}
