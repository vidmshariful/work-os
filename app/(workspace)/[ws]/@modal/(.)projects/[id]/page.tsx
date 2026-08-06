import { ProjectDetail } from "@/components/features/projects/project-detail";

// Intercepts /[ws]/projects/[id] when it is reached from inside the app, so
// a project opens over the list instead of replacing it. A direct link, a
// reload or a new tab skips this entirely and renders the full page, which
// is why the body is a shared component rather than duplicated here.
//
// The frame is chosen inside ProjectDetail rather than wrapped around it
// here, because a project that will not load needs a different frame, and
// this route has not read the project yet. Wrapping it here meant the only
// way to report that was notFound(), which does not stay inside the slot: it
// takes the page underneath with it.
export default async function ProjectModalRoute({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  return <ProjectDetail ws={ws} id={id} shell="panel" />;
}
