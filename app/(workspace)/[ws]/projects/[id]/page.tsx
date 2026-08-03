import type { Metadata } from "next";
import { ProjectDetail } from "@/components/features/projects/project-detail";

export const metadata: Metadata = { title: "Project" };

// The full page. Reached by a direct link, a reload, or a new tab. Arriving
// from inside the app hits the @modal slot instead and gets the same body in
// a floating panel.
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  return <ProjectDetail ws={ws} id={id} />;
}
