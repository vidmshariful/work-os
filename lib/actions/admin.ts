"use server";

// Admin mutations: memberships, project templates, workspace settings.
// Everything runs on the user client. RLS is the real gate (executives for
// memberships and workspaces, managers for templates); the capability checks
// here only produce friendly errors.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/data/context";
import { isToggleable } from "@/lib/data/workspace-settings";
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

// ---- Admin Control Center: settings, features, ownership ----

export interface WorkspaceSettingsPatch {
  display_name?: string;
  timezone?: string;
  week_start_day?: number;
  locale?: string;
  logo_url?: string;
}

// Validated against the runtime's own timezone database rather than a list we
// would have to maintain.
function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateWorkspaceSettings(
  ws: string,
  patch: WorkspaceSettingsPatch
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { ok: false, error: "Only executives can change workspace settings." };
  }

  // Whitelist the writable columns, validating each one.
  const update: Record<string, unknown> = {};

  if (patch.display_name !== undefined) {
    const name = patch.display_name.trim();
    if (!name) return { ok: false, error: "Give the workspace a display name." };
    if (name.length > 60) {
      return { ok: false, error: "Keep the display name under 60 characters." };
    }
    update.display_name = name;
  }
  if (patch.timezone !== undefined) {
    const tz = patch.timezone.trim();
    if (!isValidTimezone(tz)) {
      return { ok: false, error: "That is not a timezone we recognize." };
    }
    update.timezone = tz;
  }
  if (patch.week_start_day !== undefined) {
    const day = Number(patch.week_start_day);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return { ok: false, error: "Pick a day of the week." };
    }
    update.week_start_day = day;
  }
  if (patch.locale !== undefined) {
    const locale = patch.locale.trim();
    if (!locale) return { ok: false, error: "Pick a locale." };
    update.locale = locale;
  }
  if (patch.logo_url !== undefined) {
    const url = patch.logo_url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "A logo URL must start with http or https." };
    }
    update.logo_url = url || null;
  }

  if (Object.keys(update).length === 0) return { ok: true };
  update.updated_by = ctx.userId;
  update.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_settings")
    .update(update)
    .eq("workspace_id", ctx.workspace.id);
  if (error) {
    return { ok: false, error: "Could not save the settings. Try again." };
  }

  // Settings reach the shell, so refresh the layout for every route below it.
  revalidatePath(`/${ws}`, "layout");
  return { ok: true };
}

export async function toggleFeature(
  ws: string,
  featureKey: string,
  input: { enabled?: boolean; min_archetype?: Archetype | null }
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { ok: false, error: "Only executives can change features." };
  }
  // home, tasks, and admin are structural. Refusing them here is the second
  // gate; the read path ignores them regardless, so Settings can never be
  // switched off from under the person holding the switch.
  if (!isToggleable(featureKey)) {
    return { ok: false, error: "That part of the app cannot be turned off." };
  }

  const row: Record<string, unknown> = {
    workspace_id: ctx.workspace.id,
    feature_key: featureKey,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  if (input.enabled !== undefined) row.enabled = input.enabled;
  if (input.min_archetype !== undefined) row.min_archetype = input.min_archetype;

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_features")
    .upsert(row, { onConflict: "workspace_id,feature_key" });
  if (error) {
    return { ok: false, error: "Could not save the change. Try again." };
  }

  // Navigation is built from these, so the whole shell refreshes.
  revalidatePath(`/${ws}`, "layout");
  return { ok: true };
}

export type OwnableEntity = "space" | "list" | "project" | "client";

export async function reassignOwner(
  ws: string,
  entity: OwnableEntity,
  entityId: string,
  ownerId: string | null
): Promise<ActionResult> {
  const ctx = await getWorkspaceContext(ws);
  if (!ctx.capabilities.canSeeAdmin) {
    return { ok: false, error: "Only executives can reassign ownership." };
  }

  // An owner must be an active member of this workspace.
  if (ownerId) {
    const supabase = await createClient();
    const { data: member } = await supabase
      .from("memberships")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("profile_id", ownerId)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) {
      return { ok: false, error: "That person is not an active member here." };
    }
  }

  if (entity === "client") {
    // Clients are above the wall. The base table is revoked from the app role,
    // so this write goes through the admin client, exactly as lib/actions/
    // clients.ts does, and only after an explicit above-wall check.
    if (!ctx.aboveWall) {
      return { ok: false, error: "Only executives can reassign ownership." };
    }
    const admin = createAdminClient();
    const { error } = await admin
      .from("clients")
      .update({ owner_id: ownerId })
      .eq("id", entityId)
      .eq("workspace_id", ctx.workspace.id);
    if (error) {
      return { ok: false, error: "Could not reassign the owner. Try again." };
    }
    revalidatePath(`/${ws}/admin/ownership`);
    revalidatePath(`/${ws}/clients`);
    return { ok: true };
  }

  const supabase = await createClient();
  let error;

  if (entity === "space") {
    ({ error } = await supabase
      .from("departments")
      .update({ lead_id: ownerId })
      .eq("id", entityId)
      .eq("workspace_id", ctx.workspace.id));
  } else if (entity === "list") {
    // Lists hang off a department rather than the workspace, so scope the
    // write through the spaces of this workspace.
    const { data: space } = await supabase
      .from("project_lists")
      .select("department_id, department:departments(workspace_id)")
      .eq("id", entityId)
      .maybeSingle();
    const owningWorkspace = (
      space?.department as { workspace_id: string } | null | undefined
    )?.workspace_id;
    if (!space || owningWorkspace !== ctx.workspace.id) {
      return { ok: false, error: "That list no longer exists." };
    }
    ({ error } = await supabase
      .from("project_lists")
      .update({ owner_id: ownerId })
      .eq("id", entityId));
  } else {
    ({ error } = await supabase
      .from("projects")
      .update({ owner_id: ownerId })
      .eq("id", entityId)
      .eq("workspace_id", ctx.workspace.id));
  }

  if (error) {
    return { ok: false, error: "Could not reassign the owner. Try again." };
  }

  revalidatePath(`/${ws}/admin/ownership`);
  revalidatePath(`/${ws}/departments`);
  revalidatePath(`/${ws}/projects`);
  return { ok: true };
}
