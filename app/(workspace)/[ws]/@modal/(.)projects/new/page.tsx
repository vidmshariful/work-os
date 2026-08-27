import { NewProjectBody } from "@/components/features/projects/new-project-body";

// /projects/new is a sibling of /projects/[id], so the intercepting route
// next door matched it with id = "new", looked for a project by that name,
// found none, and threw "Not found" over whatever page you were on. Clicking
// New project did not open the form, it opened an error.
//
// A static segment outranks a dynamic one, so this is what /projects/new
// matches in the modal slot now. It cannot simply render nothing: an
// intercepted navigation leaves the page underneath in place on purpose, so
// an empty panel would look like the click did nothing at all. It renders
// the real form, which is the better behaviour anyway: New project opens
// over the list exactly as a project does.
export default async function NewProjectModalRoute({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string }>;
  searchParams: Promise<{ department?: string; list?: string }>;
}) {
  const { ws } = await params;
  const sp = await searchParams;
  return <NewProjectBody ws={ws} department={sp.department} list={sp.list} shell="panel" />;
}
