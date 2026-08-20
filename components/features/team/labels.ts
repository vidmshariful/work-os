// Shared labels and shapes for the team area. Archetype display maps to the
// tag palette. Member is the directory row: a membership joined to its
// profile.
import type { Archetype, Membership, Profile } from "@/lib/types";
import type { TagTone } from "@/components/primitives/tag";

export type Member = Membership & { profile: Profile };

// The five archetypes are what every permission in the app is written
// against, so the keys never change. What people read is another matter:
// "domain manager" means nothing to somebody joining on Monday, so each one
// carries a plain sentence saying what the person can actually do. The
// sentence is the label's job, not a tooltip's.
export const ARCHETYPE_META: Record<
  Archetype,
  { label: string; tone: TagTone; blurb: string }
> = {
  executive: {
    label: "Full access",
    tone: "violet",
    blurb: "Sees everything, has the final say on leave, and can open Settings.",
  },
  domain_manager: {
    label: "Manages a department",
    tone: "blue",
    blurb: "Runs a Space: creates projects, assigns work, endorses leave.",
  },
  team_lead: {
    label: "Leads a team",
    tone: "teal",
    blurb: "Assigns tasks and endorses leave for the people who report to them.",
  },
  contributor: {
    label: "Does the work",
    tone: "green",
    blurb: "Works on tasks assigned to them. Cannot assign work to others.",
  },
  revenue: {
    label: "Sales and clients",
    tone: "rose",
    blurb: "Works the client pipeline. Sees client names and commercial detail.",
  },
};

export const ARCHETYPES: Archetype[] = [
  "executive",
  "domain_manager",
  "team_lead",
  "contributor",
  "revenue",
];

// Where somebody is in the journey from invited to gone. Derived rather than
// stored: whether an invitation was accepted is auth's fact, not ours.
export type MemberStatus = "active" | "invited" | "deactivated";

// Blue for an outstanding invitation, not amber. Amber is the wall signal and
// nothing else in this product, so a pending invite cannot borrow it however
// well it would suit.
export const STATUS_META: Record<
  MemberStatus,
  { label: string; tone: TagTone }
> = {
  active: { label: "Active", tone: "green" },
  invited: { label: "Invited", tone: "blue" },
  deactivated: { label: "Deactivated", tone: "gray" },
};
