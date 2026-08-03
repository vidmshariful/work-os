"use client";

import { cn } from "@/lib/utils";
import { spaceIconFor } from "./space-icons";

// The space's picture, in its own colour. Three cases, in order:
//
//   a named icon   the value matches SPACE_ICONS, so draw that icon
//   an emoji       any other non-empty value, drawn as text
//   nothing        the first letter of the name
//
// The letter is a fallback, not the intended state. Before the icon picker
// existed it was the only thing anyone ever saw, which made every space in
// the sidebar a monogram.
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
  const Icon = spaceIconFor(icon);
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
      {Icon ? (
        <Icon
          style={{ width: size * 0.55, height: size * 0.55 }}
          strokeWidth={2}
          aria-hidden
        />
      ) : (
        icon || name.slice(0, 1)
      )}
    </span>
  );
}
