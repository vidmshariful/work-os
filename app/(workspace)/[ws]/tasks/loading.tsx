import { PageSkeleton } from "@/components/primitives/page-skeleton";

// The tab and grouping switches here are links, not router.replace, so a
// boundary is safe. Verified against a production build.
export default function TasksLoading() {
  return <PageSkeleton body="rows" />;
}
