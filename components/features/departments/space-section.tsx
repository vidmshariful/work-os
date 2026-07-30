"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { CountBadge } from "@/components/primitives/misc";
import { isTagTone, toneDotClass } from "@/components/primitives/tag";
import { cn } from "@/lib/utils";

// One section header for every grouping mode: chevron, label, count, and
// whatever actions that group owns. Built once so grouping by status looks
// exactly like grouping by list.
export function SpaceSection({
  anchorId,
  label,
  count,
  color,
  renaming = false,
  onRename,
  onRenameCancel,
  actions,
  children,
}: {
  anchorId?: string;
  label: string;
  count: number;
  // A TagTone key. Only list sections carry one; a status or assignee group
  // has no colour of its own to show.
  color?: string | null;
  // Rename happens here rather than in a dialog, so the name is edited where
  // it is read. The caller owns the state, because it also owns the rollback.
  renaming?: boolean;
  onRename?: (name: string) => void;
  onRenameCancel?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(label);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(label);
    // Select the whole name, so typing replaces it and the arrow keys do not
    // have to be used to fix a half-edited one.
    requestAnimationFrame(() => input.current?.select());
  }, [renaming, label]);

  const commit = () => {
    const clean = draft.trim();
    if (!clean || clean === label) onRenameCancel?.();
    else onRename?.(clean);
  };

  const dot =
    color && isTagTone(color) ? (
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", toneDotClass(color))}
      />
    ) : null;

  return (
    <section id={anchorId} className="scroll-mt-6">
      <div className="group/section flex items-center gap-1.5 px-1 pb-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="flex items-center gap-1.5 rounded-[6px] text-text-3 outline-none transition-colors hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
            strokeWidth={2}
          />
          {/* While renaming, the label moves out of the button: an input
              inside a button is not a thing a browser can do. */}
          {renaming ? null : (
            <span className="flex items-center gap-1.5">
              {dot}
              <span className="group-label">{label}</span>
            </span>
          )}
        </button>
        {renaming ? (
          <span className="flex items-center gap-1.5">
            {dot}
            <input
              ref={input}
              autoFocus
              value={draft}
              aria-label={`Rename ${label}`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  // Stop here: Escape in this input means "keep the old
                  // name", not "clear the row selection behind me".
                  e.stopPropagation();
                  onRenameCancel?.();
                }
              }}
              className="h-6 w-44 rounded-[7px] border border-brand bg-surface px-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-1 outline-none ring-2 ring-brand/25"
            />
          </span>
        ) : null}
        {/* CountBadge hides itself at zero by design, but an always-visible
            group still needs its badge, so zero is drawn muted instead. */}
        {count > 0 ? (
          <CountBadge count={count} className="ml-0" />
        ) : (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-chip-gray px-1.5 font-mono text-[11px] font-semibold text-text-3 tabular">
            0
          </span>
        )}
        {actions ? (
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  );
}
