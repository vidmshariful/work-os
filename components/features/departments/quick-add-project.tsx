"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ProgressRing } from "@/components/primitives/progress";
import { quickAddProject } from "@/lib/actions/projects";

// The fast path for capturing work. One field, Enter to create, focus stays
// put so the next one can be typed straight away. Escape gives the row back
// its placeholder state and returns focus to the page.
//
// Titles in flight are drawn as muted rows above the input, so a run of quick
// entries reads as a list being filled rather than as nothing happening. They
// carry no code and no controls, because they do not have an id yet: the
// database mints the code, and inventing one would put a wrong number on
// screen for as long as the round trip takes.
// Which list last had something typed into it, and when. The row cannot keep
// this in state, because the thing it has to survive is being unmounted: an
// empty section draws its quick add inside a plain card, and a section with
// work in it draws it inside the project list, so adding the first project
// swaps one subtree for the other and builds a new input. The refresh after
// any later add can do the same. Focus is restored on the way back in.
let lastTypedIn: { key: string; at: number } | null = null;

export function QuickAddProject({
  ws,
  slug,
  departmentId,
  listId,
  listName,
}: {
  ws: string;
  slug: string;
  departmentId: string;
  // Null in the Unlisted section, which files the project into the space with
  // no list at all.
  listId: string | null;
  listName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [inFlight, setInFlight] = useState<string[]>([]);
  const [refreshing, startRefresh] = useTransition();
  const wasRefreshing = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // Pending rows clear only once a refresh has actually completed, or the
  // real row and the ghost of it would be on screen at the same time.
  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true;
      return;
    }
    if (wasRefreshing.current) {
      wasRefreshing.current = false;
      setInFlight([]);
    }
  }, [refreshing]);

  // A remount within a couple of seconds of an add is this row coming back,
  // so the caret goes back with it. Longer than that and it is an ordinary
  // page load, which has no business stealing focus.
  const focusKey = listId ?? `unlisted:${departmentId}`;
  useEffect(() => {
    if (!lastTypedIn || lastTypedIn.key !== focusKey) return;
    if (Date.now() - lastTypedIn.at > 4000) {
      lastTypedIn = null;
      return;
    }
    lastTypedIn = null;
    input.current?.focus();
  }, [focusKey]);

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    lastTypedIn = { key: focusKey, at: Date.now() };
    setValue("");
    setInFlight((f) => [...f, title]);
    void quickAddProject(ws, slug, departmentId, listId, title).then((res) => {
      if (res.error) {
        setInFlight((f) => {
          const next = [...f];
          const at = next.indexOf(title);
          if (at >= 0) next.splice(at, 1);
          return next;
        });
        if (lastTypedIn?.key === focusKey) lastTypedIn = null;
        toast.error(res.error);
        // Give the typing back rather than making them remember it.
        setValue((v) => (v ? v : title));
        return;
      }
      // The refresh is what usually replaces this subtree, so the stamp is
      // renewed here rather than only at submit time.
      lastTypedIn = { key: focusKey, at: Date.now() };
      startRefresh(() => router.refresh());
    });
  };

  return (
    <div className="border-t border-border">
      {/* The pending rows live in their own box, empty or not. Rendered as
          bare siblings they sat in front of the form in the same child list,
          so the first one to appear shifted the form along by one and React
          rebuilt it, taking the caret with it. Typing a second project meant
          clicking back into the box every time. */}
      <div>
        {inFlight.map((title, i) => (
          <div
            key={`${title}-${i}`}
            className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
          >
            <div className="shrink-0 pl-[26px]">
              <ProgressRing value={0} size={32} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-medium text-text-3">{title}</div>
              <div className="mt-0.5 text-meta text-text-3">Adding</div>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 px-5 py-2.5"
      >
        <Plus className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
        <input
          ref={input}
          value={value}
          aria-label={`Add a project to ${listName}`}
          placeholder="Add a project, then press Enter"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            // Escape belongs to this input while it is being used. Letting it
            // through would clear the row selection behind the list too.
            e.stopPropagation();
            setValue("");
            input.current?.blur();
          }}
          className="h-7 w-full bg-transparent text-body text-text-1 outline-none placeholder:text-text-3"
        />
      </form>
    </div>
  );
}
