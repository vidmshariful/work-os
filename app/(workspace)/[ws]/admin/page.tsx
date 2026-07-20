import { redirect } from "next/navigation";

export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  redirect(`/${ws}/admin/general`);
}
