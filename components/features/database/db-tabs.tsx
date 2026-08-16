import Link from "next/link";
import { cn } from "@/lib/utils";

// Tables and Docs are two halves of the Database section.
export function DbTabs({
  ws,
  active,
}: {
  ws: string;
  active: "tables" | "docs";
}) {
  const seg = (on: boolean) =>
    cn(
      "rounded-[7px] px-3 py-1 text-body font-medium transition-colors",
      on ? "bg-nav-active text-text-1" : "text-text-2 hover:text-text-1"
    );
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-0.5">
      <Link href={`/${ws}/database`} className={seg(active === "tables")}>
        Tables
      </Link>
      <Link href={`/${ws}/database/docs`} className={seg(active === "docs")}>
        Docs
      </Link>
    </div>
  );
}
