# Work OS

Internal operating system for Vidiosa. Next.js 15 App Router + TypeScript + Tailwind v4 + Supabase. The build spec lives at `docs/build-plan.md` and is the source of truth.

## The two non-negotiables

1. **The brand wall.** Client identity is enforced in Postgres, not the UI. The app reads clients ONLY through the `v_clients` view (never the `clients` table, which is revoked). Below the wall, commercial fields come back null and a client is a code like `CLT-1001`, rendered in mono via `CodeLabel`. Never render a lock icon, blank box, or "redacted" hint to below-wall users: masking must look like the normal state of the world. Use `clientLabel()`, `isUnmasked()`, `isConfidential()` from `lib/wall.ts`. The amber `ConfidentialChip` appears only on above-wall screens for niche-brand clients (`origin != 'direct'`). Amber is never decorative.
2. **Secrets.** No secret in client code, ever. `lib/supabase/admin.ts` (service role) is imported only by server actions/RSC. `.env.local` is git-ignored.

## Architecture

- Server Components by default; `"use client"` only where interactivity demands.
- Reads: cookie-bound server client (`lib/supabase/server.ts`) under the user's RLS.
- Writes: server actions in `lib/actions/*.ts` marked `"use server"`. RLS is the real gate; actions still check `capabilities` for clean errors. Call `revalidatePath` after writes.
- Client writes (create client, onboarding) go through the admin client after an explicit above-wall/role check server-side.
- Session context: `getSession()` / `getWorkspaceContext(slug)` from `lib/data/context.ts` (cached per request). Workspace pages live at `app/(workspace)/[ws]/...`; `params` is a Promise in Next 15, await it.
- Schema changes are ordered SQL files in `supabase/migrations`, applied by `node scripts/migrate.mjs`. Never edit schema by hand.
- Row types: `lib/types.ts`. RBAC nav + capabilities: `lib/rbac.ts`.

## Design system (Section 7 of the plan)

- Tokens are in `app/globals.css`: canvas `bg-canvas`, cards `bg-surface`, text `text-text-1/2/3`, accent `brand`/`brand-soft`, wall amber `wall`/`wall-soft`, semantic + tag palette (`tag-blue`, `tag-violet`, ...). Radii: cards 14px, controls 9px, chips 8px.
- Compose screens from primitives in `components/primitives/`: Card/CardHeader/CardBody, StatCard, ListRow, Tag + status chips + ConfidentialChip, PersonAvatar/AvatarStack, ProgressRing/ProgressBar, DataTable, RightRailPanel, Breadcrumbs, CountBadge, DragHandle, CodeLabel, EmptyState, Field/SearchField. shadcn/ui primitives in `components/ui/`. Icons: lucide, 18-20px, stroke 1.5.
- Codes, dates, and numeric columns use `font-mono` + `tabular` class.
- **Type comes from the scale, never from a pixel value.** Seven steps, each with its own line height, defined in `app/globals.css`: `text-micro` `text-label` `text-meta` `text-body` `text-lead` `text-h3` `text-h2` `text-h1`. `text-body` is the default, `text-meta` is secondary text, `text-label` is an uppercase column or group heading. Do not write `text-[13px]` or `text-sm`: if a size seems missing, the answer is one of the seven, not an eighteenth.
- Page title is the `page-title` utility with a `page-subtitle` under it. Column headings use `col-label`. See `app/(workspace)/[ws]/home/page.tsx` for the reference composition.
- A two-column page grid needs `items-start`, or the shorter column stretches to the taller one and leaves a well of dead space under it.
- Cards carry a border and almost no shadow. A panel inside a card is `Panel`, not a second `Card`. `shadow-pop` is for things that genuinely float: menus, dialogs.
- UI copy: sentence case, plain verbs, no em-dashes anywhere. Periods, commas, or colons.
- Empty states always offer a next action. Every list row hover reveals its actions.

## Testing

- `npx tsc --noEmit` must pass. `npm run build` must pass.
- Wall acceptance: `node scripts/wall-test.mjs` must stay green.
- Seed users all share the seed password; see scripts/seed.mjs (emails like rakib@vidiosa.com below wall, nadia@vidiosa.com above).
