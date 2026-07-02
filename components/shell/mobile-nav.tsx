"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import type { NavGroup } from "@/lib/rbac";
import type { Profile, Workspace } from "@/lib/types";

// On small screens the sidebar collapses into a drawer.
export function MobileNav({
  workspace,
  profile,
  roleLabel,
  navGroups,
  myTaskCount,
}: {
  workspace: Workspace;
  profile: Profile;
  roleLabel: string;
  navGroups: NavGroup[];
  myTaskCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open navigation"
          className="flex size-9 items-center justify-center rounded-[9px] text-text-2 transition-colors hover:bg-surface-2 md:hidden"
        >
          <Menu className="size-5 stroke-[1.5]" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[248px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Sidebar
          workspace={workspace}
          profile={profile}
          roleLabel={roleLabel}
          navGroups={navGroups}
          myTaskCount={myTaskCount}
        />
      </SheetContent>
    </Sheet>
  );
}
