import { PageSkeleton } from "@/components/primitives/page-skeleton";

// The dashboard: stat cards, then the work lists.
export default function HomeLoading() {
  return <PageSkeleton body="stats-rows" />;
}
