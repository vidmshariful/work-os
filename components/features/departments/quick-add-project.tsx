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

  const submit = () => {
    const title = value.trim();
    if (!title) return;
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
        toast.error(res.error);
        // Give the typing back rather than making them remember it.
        setValue((v) => (v ? v : title));
        return;
      }
      startRefresh(() => router.refresh());
    });
  };

  return (
    <div className="border-t border-border">
      {inFlight.map((title, i) => (
        <div
          key={`${title}-${i}`}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
        >
          <div className="shrink-0 pl-[26px]">
            <ProgressRing value={0} size={32} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-3">{title}</div>
            <div className="mt-0.5 text-[12.5px] text-text-3">Adding</div>
          </div>
        </div>
      ))}
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
          className="h-7 w-full bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
        />
      </form>
    </div>
  );
}
