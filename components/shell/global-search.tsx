"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchWorkspace, type SearchResult } from "@/lib/actions/search";

export function GlobalSearch({
  slug,
  workspaceId,
}: {
  slug: string;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onQuery = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        startTransition(async () => {
          setResults(await searchWorkspace(slug, workspaceId, value));
        });
      }, 200);
    },
    [slug, workspaceId]
  );

  const groups = ["Projects", "Tasks", "Clients", "People"] as const;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-3 outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-border bg-chip-gray px-1.5 font-mono text-[10.5px] text-text-3">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search projects, tasks, clients, people" onValueChange={onQuery} />
          <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {groups.map((group) => {
            const items = results.filter((r) => r.group === group);
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group} heading={group}>
                {items.map((r) => (
                  <CommandItem
                    key={r.href + r.label}
                    value={r.href + r.label}
                    onSelect={() => {
                      setOpen(false);
                      router.push(r.href);
                    }}
                  >
                    <span className="truncate">{r.label}</span>
                    <span className="ml-auto font-mono text-[11px] text-text-3">
                      {r.sublabel}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
