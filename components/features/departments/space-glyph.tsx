"use client";

import { cn } from "@/lib/utils";

// The letter avatar every surface already draws, with the icon taking its
// place when one is set. Kept here so the panel's preview and the real thing
// cannot drift.
export function SpaceGlyph({
  name,
  icon,
  color,
  size = 36,
  fontScale,
  className,
}: {
  name: string;
  icon: string | null;
  color: string;
  size?: number;
  // Small glyphs need proportionally larger type or the letter disappears.
  // The sidebar draws at 20px and would otherwise get an 8px letter.
  fontScale?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] font-semibold",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}1A`,
        color,
        fontSize: size * (fontScale ?? (icon ? 0.5 : 0.4)),
      }}
    >
      {icon || name.slice(0, 1)}
    </span>
  );
}
