import type { Metadata } from "next";
import { NewProjectBody } from "@/components/features/projects/new-project-body";

export const metadata: Metadata = { title: "New project" };

// The full page, reached by a direct link, a reload or a new tab. Arriving
// from inside the app goes through the intercepting route in @modal instead,
// which renders the same body in a panel.
export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ department?: string; list?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  return <NewProjectBody ws={ws} department={sp.department} list={sp.list} shell="page" />;
}
