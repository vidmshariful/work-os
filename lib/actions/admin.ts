"use server";

// Admin mutations: memberships, project templates, workspace settings.
// Everything runs on the user client. RLS is the real gate (executives for
// memberships and workspaces, managers for templates); the capability checks
// here only produce friendly errors.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/data/context";
import type { Archetype, RoleType, WallSide } from "@/lib/types";
import {
  ACCENT_PRESETS,
  type TemplateStructureDraft,
} from "@/components/features/admin/shared";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface MembershipPatch {
  role?: RoleType;
  archetype?: Archetype;
  wall_side?: WallSide;
  reports_to?: string | null;
  is_active?: boolean;
}

export async function updateMembership(
  ws: string,
  membershipId: string,
  patch: MembershipPatch
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { ok: false, error: "Only executives can manage people." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("memberships")
    .select("id, profile_id")
    .eq("id", membershipId)
    .eq("workspace_id", ctx.workspace.id)
    .single();
  if (!target) {
    return { ok: false, error: "That membership no longer exists." };
  }

  if (patch.is_active === false && target.profile_id === ctx.userId) {
    return { ok: false, error: "You cannot deactivate your own membership." };
  }
  if (patch.reports_to && patch.reports_to === target.profile_id) {
    return { ok: false, error: "A person cannot report to themselves." };
  }

  // Whitelist the writable columns.
  const update: Record<string, unknown> = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.archetype !== undefined) update.archetype = patch.archetype;
  if (patch.wall_side !== undefined) update.wall_side = patch.wall_side;
  if (patch.reports_to !== undefined) update.reports_to = patch.reports_to;
  if (patch.is_active !== undefined) update.is_active = patch.is_active;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase
    .from("memberships")
    .update(update)
    .eq("id", membershipId)
    .eq("workspace_id", ctx.workspace.id);
  if (error) {
    return { ok: false, error: "Could not save the change. Try again." };
  }

  revalidatePath(`/${ws}/admin/people`);
  revalidatePath(`/${ws}/team`);
  return { ok: true };
}

export interface TemplateDraft {
  id?: string;
  name: string;
  description: string;
  project_type: string;
  is_default: boolean;
  structure: TemplateStructureDraft;
}

export async function saveTemplate(
  ws: string,
  draft: TemplateDraft
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { ok: false, error: "Only managers can edit templates." };
  }

  const name = draft.name.trim();
  if (!name) return { ok: false, error: "Give the template a name." };

  // Serialize to the structure jsonb shape, dropping empty rows.
  const phases = (draft.structure.phases ?? [])
    .map((p) => ({
      name: p.name.trim(),
      tasks: (p.tasks ?? [])
        .map((t) => ({
          title: t.title.trim(),
          ...(t.description ? { description: t.description } : {}),
        }))
        .filter((t) => t.title.length > 0),
    }))
    .filter((p) => p.name.length > 0);
  const deliverables = (draft.structure.deliverables ?? [])
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
  const defaultTitle = draft.structure.default_title?.trim();
  const structure: TemplateStructureDraft = {
    ...(defaultTitle ? { default_title: defaultTitle } : {}),
    phases,
    deliverables,
  };

  const supabase = await createClient();

  // Setting a template as default clears the previous default first.
  if (draft.is_default) {
    const { error } = await supabase
      .from("project_templates")
      .update({ is_default: false })
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_default", true);
    if (error) {
      return { ok: false, error: "Could not clear the previous default." };
    }
  }

  const row = {
    name,
    description: draft.description.trim() || null,
    project_type: draft.project_type.trim() || null,
    structure,
    is_default: draft.is_default,
  };

  const { error } = draft.id
    ? await supabase
        .from("project_templates")
        .update(row)
        .eq("id", draft.id)
        .eq("workspace_id", ctx.workspace.id)
    : await supabase
        .from("project_templates")
        .insert({ ...row, workspace_id: ctx.workspace.id });
  if (error) {
    return { ok: false, error: "Could not save the template. Try again." };
  }

  revalidatePath(`/${ws}/admin/templates`);
  return { ok: true };
}

export async function deleteTemplate(
  ws: string,
  templateId: string
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canManageTemplates) {
    return { ok: false, error: "Only managers can delete templates." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_templates")
    .delete()
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspace.id);
  if (error) {
    return { ok: false, error: "Could not delete the template. Try again." };
  }

  revalidatePath(`/${ws}/admin/templates`);
  return { ok: true };
}

export async function updateWorkspace(
  ws: string,
  input: { name: string; accent_color: string }
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { ok: false, error: "Only executives can change workspace settings." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the workspace a name." };
  if (name.length > 60) {
    return { ok: false, error: "Keep the name under 60 characters." };
  }
  if (!(ACCENT_PRESETS as readonly string[]).includes(input.accent_color)) {
    return { ok: false, error: "Pick one of the preset colors." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ name, accent_color: input.accent_color })
    .eq("id", ctx.workspace.id);
  if (error) {
    return { ok: false, error: "Could not save the changes. Try again." };
  }

  // The name and accent show in the shell, so refresh the whole layout.
  revalidatePath(`/${ws}`, "layout");
  return { ok: true };
}
