// Shared constants and types for the admin area. Plain module so both the
// server actions and the client components can import it.
import type {
  Archetype,
  ProjectFieldKind,
  ProjectFieldOption,
  TemplateStructure,
} from "@/lib/types";

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  executive: "Executive",
  domain_manager: "Domain manager",
  team_lead: "Team lead",
  contributor: "Contributor",
  revenue: "Revenue",
};

export const ARCHETYPES = Object.keys(ARCHETYPE_LABELS) as Archetype[];

// The 8 preset accent colors for workspace settings.
export const ACCENT_PRESETS = [
  "#3B6FF6",
  "#7C5CFC",
  "#16A34A",
  "#C77A15",
  "#E5486D",
  "#12A8A0",
  "#DC2626",
  "#14171B",
] as const;

// The structure jsonb shape the templates editor reads and writes. Extends
// the shared TemplateStructure with the optional default project title.
export interface TemplateStructureDraft extends TemplateStructure {
  default_title?: string;
}

// A field a template can set, paired with the definition so the editor can
// draw the right control for its kind. space is the name of the one space
// the field is scoped to, or null when it applies everywhere: a template
// that stamps a Production-only field onto a Sales project would silently
// drop it, so the editor says which is which.
export interface TemplateFieldOption {
  id: string;
  name: string;
  kind: ProjectFieldKind;
  options: ProjectFieldOption[];
  space: string | null;
}

export const WALL_HELPER_COPY =
  "The wall line is drawn here, in data. Changes apply on the person's next read.";
