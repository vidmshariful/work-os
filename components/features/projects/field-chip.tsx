"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Sliders } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tag, isTagTone, type TagTone } from "@/components/primitives/tag";
import { setProjectFieldValue } from "@/lib/actions/project-fields";
import { cn } from "@/lib/utils";

export interface ChipField {
  id: string;
  name: string;
  options: { value: string; label: string; color: string | null }[];
}

const tone = (color: string | null | undefined): TagTone =>
  color && isTagTone(color) ? color : "gray";

// A choice field on a board card: what it says now, and a menu to change it
// without opening the project. The board is where a producer scans the floor,
// so the stage a project is at has to be readable and changeable there.
//
// The value is drawn from the click and corrected if the server refuses,
// the same contract the Fields block on the project page uses. Anything
// slower would be worse than not having it here at all.
export function FieldChip({
  ws,
  projectId,
  field,
  value,
  canEdit,
}: {
  ws: string;
  projectId: string;
  field: ChipField;
  value: string | null;
  canEdit: boolean;
}) {
  const [shown, setShown] = useState<string | null>(value);
  const [pending, start] = useTransition();

  // The server's copy wins once it catches up, so a value changed elsewhere
  // is not masked by a stale local one.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setShown(value);
  }

  const current = field.options.find((o) => o.value === shown);
  // Unset says which field it is rather than showing a bare dash, so the
  // card still tells you what is missing.
  const label = current ? (
    <Tag tone={tone(current.color)}>{current.label}</Tag>
  ) : (
    <span className="text-label text-text-3">{field.name}</span>
  );
  const icon = (
    <Sliders className="size-3 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
  );

  if (!canEdit) {
    return (
      <span data-field-chip={field.id} className="flex items-center gap-1.5 px-1">
        {icon}
        {label}
      </span>
    );
  }

  const pick = (next: string | null) => {
    const before = shown;
    setShown(next);
    start(async () => {
      const res = await setProjectFieldValue(ws, projectId, field.id, next);
      if (res.error) {
        setShown(before);
        toast.error(`${field.name}: ${res.error}`);
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-field-chip={field.id}
          aria-label={`Set ${field.name}`}
          // The card underneath opens the project on click, and dragging it
          // starts a move, so neither may hear this one.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex max-w-full items-center gap-1.5 rounded-[8px] border border-transparent px-1 py-0.5 outline-none transition-colors",
            "hover:border-border-strong hover:bg-surface-2 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
            pending && "opacity-60"
          )}
        >
          {icon}
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 text-text-3" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        onClick={(e) => e.stopPropagation()}
      >
        {field.options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => pick(o.value)}>
            <Tag tone={tone(o.color)}>{o.label}</Tag>
          </DropdownMenuItem>
        ))}
        {shown ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => pick(null)}>Clear</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
