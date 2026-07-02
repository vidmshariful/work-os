import { cn } from "@/lib/utils";
import { initials, avatarTone } from "@/lib/format";

export function PersonAvatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? ""}
        style={style}
        className={cn("rounded-full object-cover ring-2 ring-surface", className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={cn(
        "flex items-center justify-center rounded-full font-semibold ring-2 ring-surface",
        avatarTone(name),
        className
      )}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { name: string; src?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <PersonAvatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} />
      ))}
      {rest > 0 ? (
        <span
          style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
          className="flex items-center justify-center rounded-full bg-chip-gray font-semibold text-text-2 ring-2 ring-surface"
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
