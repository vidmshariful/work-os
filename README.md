# Work OS

Internal operating system for Vidiosa. It replaces the mix of ClickUp, Retable,
and verbal coordination with one spine: clients, projects, tasks, people, and a
database of reference material, with performance computed from the work itself.

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth,
RLS, Storage, Realtime).

## The two non-negotiables

**1. The brand wall.** Certain clients are, operationally, white-label clients of
Vidiosa and their identity must never reach the people who do the work. This is
enforced in Postgres, not in the UI. The app reads clients **only** through the
`v_clients` view; the `clients` table itself is revoked from application roles.
Below the wall, commercial columns come back `null` and a client is a code such
as `CLT-1001`.

Masking must look like the normal state of the world. Never render a lock icon,
a blanked box, or a "redacted" hint to a below-wall user, because that reveals
something exists to be hidden. Use `clientLabel()`, `isUnmasked()`, and
`isConfidential()` from `lib/wall.ts`. Amber is reserved for the confidential
marker on above-wall screens and is never decorative.

`npm run wall-test` proves the wall through the real API with real user JWTs. It
must stay green.

**2. Secrets.** No secret is ever committed, logged, or sent to the browser.
`.env.local` is git-ignored and **this repository contains no credentials** —
they are supplied separately. `lib/supabase/admin.ts` (service role) is imported
only by server actions and server components.

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in the values you were given
npm run migrate                # applies supabase/migrations in order
npm run seed                   # demo workspace, people, clients, projects
npm run dev
```

Every key in `.env.example` is required except `DEMO_LOGINS` / `DEMO_PASSWORD`,
which are optional and only power the demo-account switcher on `/login`. Leave
them unset in production.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build. Must pass |
| `npm run migrate` | Applies `supabase/migrations/*.sql` in order, tracked in `public._migrations` |
| `npm run seed` | Seeds a demo workspace. Refuses to run if one already exists |
| `npm run wall-test` | The brand-wall acceptance test. Must stay green |
| `npx tsc --noEmit` | Type check. Must pass |

`node scripts/demo-work.mjs` reorganizes the work area into the four spaces and
loads ClickUp-style demo content. It is idempotent.

## How it is built

- **Server Components by default.** `"use client"` only where interactivity
  demands it.
- **Reads** go through the cookie-bound server client (`lib/supabase/server.ts`)
  under the signed-in user's RLS.
- **Writes** are server actions in `lib/actions/*.ts`. RLS is the real gate;
  actions also check `capabilities` so errors read well. Call `revalidatePath`
  after writes.
- **Schema changes are migrations only.** Ordered SQL files in
  `supabase/migrations`, applied with `npm run migrate`. Never edit schema by
  hand.
- **RLS on every table from creation.** A table without a considered policy is a
  bug.

One trap worth knowing: a policy on a table must not call a helper that
re-queries that same table for the row's own id, or `INSERT ... RETURNING` is
rejected because the new row is not yet visible to the subquery. Reference the
row's own columns instead. See migrations `0021` and `0027`.

## Layout

```
app/(auth)/              login, password reset
app/(personal)/          the personal layer above any workspace
app/(workspace)/[ws]/    everything inside a workspace
components/primitives/   the design system: Card, ListRow, Tag, StatCard, ...
components/features/     feature UI, grouped by domain
lib/actions/             server actions, one file per domain
lib/rbac.ts              archetype to navigation and capabilities
lib/wall.ts              helpers for reading masked client data
supabase/migrations/     the schema, in order
docs/build-plan.md       the original v1 specification
docs/build-plan-v1.1.md  the depth pass
docs/ACCEPTANCE.md       what was built and how it was verified, per phase
```

## Roles

Fourteen job roles collapse into five archetypes — `executive`,
`domain_manager`, `team_lead`, `contributor`, `revenue` — which drive navigation
and capabilities. Wall side (`above` / `below`) is a separate axis set per
membership. Both are data, changeable from Settings with no code change.

## Design system

Tokens live in `app/globals.css`. Compose screens from `components/primitives/`
rather than hand-styling. Codes, dates, and numeric columns use `font-mono` with
the `tabular` class. Interface copy is sentence case, plain verbs, and no
em-dashes.
