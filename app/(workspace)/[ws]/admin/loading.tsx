import { RowsSkeleton } from "@/components/primitives/page-skeleton";

// The heading and the tab bar live in the layout, so only the body waits.
// Every admin tab is a list of settings, whatever it settles into.
export default function AdminLoading() {
  return <RowsSkeleton rows={6} />;
}
