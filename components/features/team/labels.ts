// Shared labels and shapes for the team area. Archetype display maps to the
// tag palette. Member is the directory row: a membership joined to its
// profile.
import type { Archetype, Membership, Profile } from "@/lib/types";
import type { TagTone } from "@/components/primitives/tag";

export type Member = Membership & { profile: Profile };

export const ARCHETYPE_META: Record<Archetype, { label: string; tone: TagTone }> = {
  executive: { label: "Executive", tone: "violet" },
  domain_manager: { label: "Domain manager", tone: "blue" },
  team_lead: { label: "Team lead", tone: "teal" },
  contributor: { label: "Contributor", tone: "green" },
  revenue: { label: "Revenue", tone: "rose" },
};

export const ARCHETYPES: Archetype[] = [
  "executive",
  "domain_manager",
  "team_lead",
  "contributor",
  "revenue",
];
