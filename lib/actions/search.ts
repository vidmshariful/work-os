"use server";

import { createClient } from "@/lib/supabase/server";
import { clientLabel } from "@/lib/wall";
import type { VClient } from "@/lib/types";

export interface SearchResult {
  group: "Projects" | "Tasks" | "Clients" | "People";
  label: string;
  sublabel: string;
  href: string;
}

// Global search. Runs under the caller's RLS: clients come back through
// v_clients so a below-wall search can only ever match a code.
export async function searchWorkspace(
  slug: string,
  workspaceId: string,
  query: string
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const like = `%${q}%`;

  const [projects, tasks, clients, people] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, title")
      .eq("workspace_id", workspaceId)
      .or(`title.ilike.${like},code.ilike.${like}`)
      .limit(5),
    supabase
      .from("tasks")
      .select("id, title, project:projects!inner(workspace_id, code)")
      .eq("project.workspace_id", workspaceId)
      .ilike("title", like)
      .limit(5),
    supabase
      .from("v_clients")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`code.ilike.${like},commercial_name.ilike.${like}`)
      .limit(5),
    supabase
      .from("memberships")
      .select("profile_id, profile:profiles!profile_id!inner(id, full_name)")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .ilike("profile.full_name", like)
      .limit(5),
  ]);

  const results: SearchResult[] = [];
  for (const p of projects.data ?? []) {
    results.push({
      group: "Projects",
      label: p.title,
      sublabel: p.code,
      href: `/${slug}/projects/${p.id}`,
    });
  }
  for (const t of tasks.data ?? []) {
    const project = t.project as unknown as { code: string };
    results.push({
      group: "Tasks",
      label: t.title,
      sublabel: project?.code ?? "",
      href: `/${slug}/tasks/${t.id}`,
    });
  }
  for (const c of (clients.data ?? []) as VClient[]) {
    results.push({
      group: "Clients",
      label: clientLabel(c),
      sublabel: c.code,
      href: `/${slug}/clients/${c.id}`,
    });
  }
  for (const m of people.data ?? []) {
    const profile = m.profile as unknown as { id: string; full_name: string };
    if (!profile) continue;
    results.push({
      group: "People",
      label: profile.full_name,
      sublabel: "Team",
      href: `/${slug}/team/${profile.id}`,
    });
  }
  return results;
}
