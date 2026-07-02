import Link from "next/link";
import { getSession } from "@/lib/data/context";
import { UserMenu } from "@/components/shell/user-menu";

// The personal layer sits above workspaces: a place to glance across
// everything you belong to. Entering a workspace is an explicit action.
export default async function PersonalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-[8px] bg-primary text-[12px] font-semibold text-primary-foreground">
              W
            </span>
            <span className="text-[15px] font-semibold text-text-1">Work OS</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="rounded-[9px] px-2.5 py-1.5 text-sm font-medium text-text-2 transition-colors hover:bg-nav-active hover:text-text-1"
            >
              Dashboard
            </Link>
            <Link
              href="/notifications"
              className="rounded-[9px] px-2.5 py-1.5 text-sm font-medium text-text-2 transition-colors hover:bg-nav-active hover:text-text-1"
            >
              Notifications
            </Link>
          </nav>
        </div>
        <UserMenu profile={session.profile} />
      </header>
      <main className="mx-auto w-full max-w-[1000px] px-5 py-8">{children}</main>
    </div>
  );
}
