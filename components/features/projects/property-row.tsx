"use client";

import { cn } from "@/lib/utils";

// The shared shell behind both the property grid and the Fields block.
//
// It exists so the two cannot become two ideas. A project's built-in facts
// and the studio's own custom fields are the same kind of thing to a reader:
// a label, a value, edited where it is read. Before this they looked nothing
// alike, and the page implied that a custom field mattered more than the due
// date.
//
// The only difference between the two is the label column, wider in the
// full-width Fields block than in a half-width grid cell. Typography, radii,
// hover treatment, the pending fade and the Empty convention are literally
// the same code.

// A transparent border until hover reads as static text, which is exactly
// what people reported: the fields looked like a printout rather than
// something you could type into. The border is now visible at rest, faint,
// and firms up on hover.
export const propertyInputClass =
  "w-full rounded-[8px] border border-border/60 bg-transparent px-2 py-1 text-[13px] text-text-1 outline-none transition-colors hover:border-border-strong hover:bg-surface-2/50 focus-visible:border-brand focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-brand/25";

// The same affordance for a value that opens a menu rather than taking
// typing: a chip, an avatar, a set of tags.
export const propertyTriggerClass =
  "rounded-[8px] border border-border/60 px-1.5 py-0.5 outline-none transition-colors hover:border-border-strong hover:bg-surface-2/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// An edit that has been drawn before the server has confirmed it. Both
// blocks show the picked value immediately and settle it afterwards, so the
// shape of an in-flight edit belongs here with the rest of what they share.
export interface Edit<T = unknown> {
  // What to draw until the same value comes back as a prop.
  value: T;
  // Bumped per dispatch, so a slow answer to an old click cannot undo a
  // newer one.
  seq: number;
  pending: boolean;
}

export const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// An unset value is not a blank. A blank reads as a rendering fault; this
// reads as a fact nobody has filled in yet.
export function EmptyValue({ label = "Empty" }: { label?: string }) {
  return <span className="px-2 text-[13px] text-text-3">{label}</span>;
}

export function PropertyRow({
  label,
  size = "wide",
  pending = false,
  children,
}: {
  label: string;
  // wide is the full-width Fields block, half is a grid cell.
  size?: "wide" | "half";
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-2">
      <span
        className={cn(
          "shrink-0 pt-1 text-[12.5px] text-text-2",
          size === "wide" ? "w-[170px]" : "w-[104px]"
        )}
      >
        {label}
      </span>
      <div className={cn("min-w-0 flex-1", pending && "opacity-60")}>{children}</div>
    </div>
  );
}
