"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Check, Group, ListFilter, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ShortcutsHint } from "@/components/features/projects/project-actions";
import { cn } from "@/lib/utils";
import {
  DUE_CHOICES,
  GROUP_CHOICES,
  SORT_CHOICES,
  STATUS_CHOICES,
  VIEW_CHOICES,
  activeFilterCount,
  buildSpaceQuery,
  restoreTarget,
  type DueChoice,
  type GroupKey,
  type SortKey,
  type SpaceFilters,
  type SpaceView,
} from "./space-filters";

// Remembered per person and per space, so someone who thinks by status in
// Production is not forced into it in Marketing.
const groupKeyFor = (userId: string, slug: string) =>
  `workos:space-group:${userId}:${slug}`;
const viewKeyFor = (userId: string, slug: string) =>
  `workos:space-view:${userId}:${slug}`;

export interface FilterOption {
  value: string;
  label: string;
}

const control =
  "inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-2 outline-none transition-colors hover:text-text-1 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

function Trigger({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <span className={cn(control, count > 0 && "border-brand/40 text-text-1")}>
      {icon}
      {label}
      {count > 0 ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] font-semibold text-white tabular">
          {count}
        </span>
      ) : null}
    </span>
  );
}

// A checkbox list in a popover. Used for status, assignee, and list, which
// are all "any of these" filters.
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Filter by ${label.toLowerCase()}`}>
          <Trigger label={label} count={selected.length} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-[12.5px] text-text-3">Nothing to pick.</p>
          ) : (
            options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] text-text-1 transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
                      on ? "border-brand bg-brand text-white" : "border-border-strong"
                    )}
                  >
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-[8px] border-t border-border px-2 py-1.5 text-left text-[12px] font-medium text-text-2 hover:text-text-1"
          >
            Clear {label.toLowerCase()}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// Due presets are ranges that overlap, so picking one replaces the last
// rather than stacking.
function SingleSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly FilterOption[];
  selected: string | null;
  onChange: (next: string | null) => void;
}) {
  const current = options.find((o) => o.value === selected);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Filter by ${label.toLowerCase()}`}>
          <Trigger label={current ? current.label : label} count={selected ? 1 : 0} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(selected === o.value ? null : o.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
              selected === o.value ? "font-medium text-text-1" : "text-text-2"
            )}
          >
            <span className="w-4">
              {selected === o.value ? (
                <Check className="size-3.5 text-brand" strokeWidth={3} />
              ) : null}
            </span>
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function SpaceControls({
  base,
  view,
  filters,
  assignees,
  lists,
  userId,
  slug,
  groupFromUrl,
  viewFromUrl,
}: {
  base: string;
  view: SpaceView;
  filters: SpaceFilters;
  assignees: FilterOption[];
  lists: FilterOption[];
  userId: string;
  slug: string;
  // True when the URL named a grouping. The URL always wins, and a stored
  // preference is only applied when it did not.
  groupFromUrl: boolean;
  // Same contract for the view, so a shared ?view= link is authoritative.
  viewFromUrl: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // False until the first render after landing on this page. Navigating
  // within it, which is what clicking a tab does, is not an arrival, so
  // these stay true and stop the restore from overriding a fresh choice.
  const arrived = useRef(false);
  const groupArrived = useRef(false);

  // The URL is the source of truth, so a Back navigation or a Clear all has
  // to pull the box back into line.
  useEffect(() => setQ(filters.q), [filters.q]);

  const push = useCallback(
    (next: Partial<SpaceFilters>) => {
      const qs = buildSpaceQuery({ ...filters, ...next, view });
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [base, filters, router, view]
  );

  const onSearch = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ q: value }), 250);
  };

  // Escape clears the box and the filter in one press, matching what people
  // expect from a search field.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    setQ("");
    push({ q: "" });
    searchRef.current?.blur();
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // An explicit choice in the URL is what gets remembered. Arriving without
  // one restores the last choice, which keeps a shared link authoritative
  // while a plain visit still feels personal.
  useEffect(() => {
    const key = groupKeyFor(userId, slug);
    const isArrival = !groupArrived.current;
    groupArrived.current = true;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      // A blocked store just means the choice is not remembered.
    }
    const target = restoreTarget({
      current: filters.group,
      stored,
      explicitInUrl: groupFromUrl,
      isArrival,
      choices: GROUP_CHOICES.map((g) => g.value),
    });
    if (target) {
      const qs = buildSpaceQuery({ ...filters, group: target as GroupKey, view });
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
      return;
    }
    // Grouping by list is the default and so is absent from the URL too.
    // Remembering it here is what stops the next visit bouncing away.
    try {
      window.localStorage.setItem(key, filters.group);
    } catch {
      // Not remembered, still usable.
    }
  }, [base, filters, groupFromUrl, router, slug, userId, view]);

  // The last view, remembered the same way. List remains the fallback for
  // anyone with nothing stored, so old links behave exactly as before.
  useEffect(() => {
    const key = viewKeyFor(userId, slug);
    const isArrival = !arrived.current;
    arrived.current = true;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      // A blocked store just means the choice is not remembered.
    }
    const target = restoreTarget({
      current: view,
      stored,
      explicitInUrl: viewFromUrl,
      isArrival,
      choices: VIEW_CHOICES,
    });
    if (target) {
      const qs = buildSpaceQuery({ ...filters, view: target });
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
      return;
    }
    // Nothing to restore, so this is the choice worth remembering. That
    // includes picking List, which the URL cannot show because it is the
    // default.
    try {
      window.localStorage.setItem(key, view);
    } catch {
      // Not remembered, still usable.
    }
  }, [base, filters, router, slug, userId, view, viewFromUrl]);

  const count = activeFilterCount(filters);
  // Clear all drops filters, not the shape of the view: sort and grouping
  // survive because neither hides anything.
  const clearAll = () => {
    const qs = buildSpaceQuery({
      sort: filters.sort,
      dir: filters.dir,
      group: filters.group,
      view,
    });
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  };

  // Built once and rendered twice: inline on wide viewports, and inside the
  // Filter popover on narrow ones, so the two can never disagree.
  const filterControls = (
    <>
      <MultiSelect
        label="Status"
        options={STATUS_CHOICES.map((s) => ({ value: s.value, label: s.label }))}
        selected={filters.status}
        onChange={(status) => push({ status })}
      />
      <MultiSelect
        label="Assignee"
        options={assignees}
        selected={filters.assignee}
        onChange={(assignee) => push({ assignee })}
      />
      <SingleSelect
        label="Due"
        options={DUE_CHOICES.map((d) => ({ value: d.value, label: d.label }))}
        selected={filters.due}
        onChange={(due) => push({ due: (due as DueChoice) ?? null })}
      />
      <MultiSelect
        label="List"
        options={lists}
        selected={filters.list}
        onChange={(list) => push({ list })}
      />
    </>
  );

  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-[11px] border border-border bg-surface px-2.5 py-2">
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-3"
          strokeWidth={1.5}
        />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Search projects"
          aria-label="Search projects by title or code"
          // How the "/" shortcut finds this box. An attribute rather than an
          // id, because the bar can be rendered more than once on a page.
          data-space-search
          className="h-8 w-[150px] rounded-[9px] border border-border bg-surface pl-7.5 pr-2 text-[12.5px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 xl:w-[200px]"
        />
      </div>

      {/* Inline on wide viewports. */}
      <div className="hidden shrink-0 items-center gap-2 xl:flex">{filterControls}</div>

      {/* One popover on narrow ones, so the bar never wraps to a second row. */}
      <div className="shrink-0 xl:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Filters">
              <Trigger
                label="Filter"
                count={count - (filters.q ? 1 : 0)}
                icon={<ListFilter className="size-3.5" strokeWidth={1.5} />}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-auto flex-col items-start gap-2 p-2">
            {filterControls}
          </PopoverContent>
        </Popover>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Group projects">
              <Trigger
                label={
                  filters.group === "list"
                    ? "Group"
                    : `By ${GROUP_CHOICES.find((g) => g.value === filters.group)?.label.toLowerCase()}`
                }
                count={0}
                icon={<Group className="size-3.5" strokeWidth={1.5} />}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            {GROUP_CHOICES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => push({ group: g.value as GroupKey })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                  filters.group === g.value ? "font-medium text-text-1" : "text-text-2"
                )}
              >
                <span className="w-4">
                  {filters.group === g.value ? (
                    <Check className="size-3.5 text-brand" strokeWidth={3} />
                  ) : null}
                </span>
                {g.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Sort projects">
              <Trigger
                label={SORT_CHOICES.find((s) => s.value === filters.sort)?.label ?? "Sort"}
                count={0}
                icon={<ArrowDownUp className="size-3.5" strokeWidth={1.5} />}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            {SORT_CHOICES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => push({ sort: s.value as SortKey })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                  filters.sort === s.value ? "font-medium text-text-1" : "text-text-2"
                )}
              >
                <span className="w-4">
                  {filters.sort === s.value ? (
                    <Check className="size-3.5 text-brand" strokeWidth={3} />
                  ) : null}
                </span>
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => push({ dir: filters.dir === "asc" ? "desc" : "asc" })}
              className="mt-1 w-full border-t border-border px-2 py-1.5 text-left text-[12px] font-medium text-text-2 hover:text-text-1"
            >
              {filters.dir === "asc" ? "Ascending" : "Descending"}, click to flip
            </button>
          </PopoverContent>
        </Popover>

        {count > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 shrink-0 gap-1 px-2 text-[12.5px] text-text-2 hover:text-text-1"
          >
            <X className="size-3.5" strokeWidth={2} />
            Clear all
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-chip-gray px-1 font-mono text-[10px] font-semibold text-text-2 tabular">
              {count}
            </span>
          </Button>
        ) : null}

        <ShortcutsHint />
      </div>
    </div>
  );
}
