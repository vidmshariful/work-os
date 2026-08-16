"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CountBadge } from "@/components/primitives/misc";

// While this link's navigation is pending, the label dims. The space pages
// cannot have a loading skeleton (a Suspense boundary above them breaks
// their query navigation, see page-skeleton.tsx), so the clicked link
// answering immediately is the feedback for that whole section.
function PendingDim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 transition-opacity",
        pending && "animate-pulse opacity-60"
      )}
    >
      {children}
    </span>
  );
}

// Sidebar NavItem: default, active, with badge. Soft neutral fill when
// active, dark text, small icon.
export function NavLink({
  href,
  label,
  icon,
  badge,
  exact = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-body font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-brand/40",
        active
          ? // A grey fill alone was doing all the work of saying where you
            // are, and grey on grey is not much of a signal. The bar is the
            // signal; the fill is just the resting surface under it.
            "bg-nav-active text-text-1 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand before:content-['']"
          : "text-text-2 hover:bg-surface-2 hover:text-text-1"
      )}
    >
      <PendingDim>
        <span className="[&>svg]:size-[18px] [&>svg]:stroke-[1.5]">{icon}</span>
        <span className="truncate">{label}</span>
        {badge !== undefined ? <CountBadge count={badge} /> : null}
      </PendingDim>
    </Link>
  );
}
