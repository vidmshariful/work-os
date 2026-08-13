import { PageSkeleton } from "@/components/primitives/page-skeleton";

// Month navigation is link-based, which survives a boundary. The filters
// that break under one use router.replace; see page-skeleton.tsx.
export default function CalendarLoading() {
  return <PageSkeleton body="calendar" />;
}
