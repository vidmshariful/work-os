import { ProjectDetail } from "@/components/features/projects/project-detail";
import { ProjectModal } from "@/components/features/projects/project-modal";

// Intercepts /[ws]/projects/[id] when it is reached from inside the app, so
// a project opens over the list instead of replacing it. A direct link, a
// reload or a new tab skips this entirely and renders the full page, which
// is why the body is a shared component rather than duplicated here.
export default async function ProjectModalRoute({
  params,
}: {
  params: Promise<{ ws: string; id: string }>;
}) {
  const { ws, id } = await params;
  return (
    <ProjectModal href={`/${ws}/projects/${id}`}>
      <ProjectDetail ws={ws} id={id} />
    </ProjectModal>
  );
}
