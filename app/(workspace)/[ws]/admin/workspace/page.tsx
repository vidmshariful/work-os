import { redirect } from "next/navigation";

// Workspace settings folded into General, so workspace identity is edited in
// one place rather than two. The old URL still resolves.
export default async function AdminWorkspacePage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  redirect(`/${ws}/admin/general`);
}
