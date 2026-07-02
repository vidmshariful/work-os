"use client";

import Link from "next/link";
import { Plus, FolderKanban, SquareCheckBig, Briefcase, CalendarPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function QuickCreate({
  slug,
  canCreateProjects,
  canAssignTasks,
  canManageClients,
  canCreateEvents,
}: {
  slug: string;
  canCreateProjects: boolean;
  canAssignTasks: boolean;
  canManageClients: boolean;
  canCreateEvents: boolean;
}) {
  const items = [
    canAssignTasks && {
      href: `/${slug}/tasks/new`,
      icon: <SquareCheckBig />,
      label: "New task",
    },
    canCreateProjects && {
      href: `/${slug}/projects/new`,
      icon: <FolderKanban />,
      label: "New project",
    },
    canManageClients && {
      href: `/${slug}/clients/new`,
      icon: <Briefcase />,
      label: "New client",
    },
    canCreateEvents && {
      href: `/${slug}/calendar/new`,
      icon: <CalendarPlus />,
      label: "New event",
    },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string }[];

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="default" className="gap-1.5">
          <Plus />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>
              {item.icon}
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
