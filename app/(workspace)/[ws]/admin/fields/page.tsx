import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/data/context";
import { createClient } from "@/lib/supabase/server";
import {
  FieldAdmin,
  type FieldAdminRow,
} from "@/components/features/admin/field-admin";
import type { ProjectField } from "@/lib/types";

export const metadata: Metadata = { title: "Fields" };

export default async function AdminFieldsPage({
  params,
}: {
  params: Promise<{ ws: string }>;
}) {
  const { ws } = await params;
  const ctx = await getWorkspaceContext(ws);
  const supabase = await createClient();

  const [{ data: fieldRows }, { data: valueRows }, { data: spaceRows }] =
    await Promise.all([
      supabase
        .from("project_fields")
        .select("*")
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
      // How many projects hold a value for each field, quoted back in the
      // delete confirmation. Read under the caller's RLS, so it counts only
      // projects this executive can see, which for an executive is all of
      // them.
      supabase.from("project_field_values").select("field_id"),
      supabase
        .from("departments")
        .select("id, name")
        .eq("workspace_id", ctx.workspace.id)
        .order("sort_order"),
    ]);

  const counts = new Map<string, number>();
  for (const v of (valueRows ?? []) as { field_id: string }[]) {
    counts.set(v.field_id, (counts.get(v.field_id) ?? 0) + 1);
  }

  const fields: FieldAdminRow[] = ((fieldRows ?? []) as ProjectField[]).map((f) => ({
    ...f,
    options: f.options ?? [],
    valueCount: counts.get(f.id) ?? 0,
  }));

  return (
    <FieldAdmin
      ws={ws}
      fields={fields}
      spaces={(spaceRows ?? []) as { id: string; name: string }[]}
    />
  );
}
