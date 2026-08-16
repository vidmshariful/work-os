import { MessageSquare } from "lucide-react";

// Nothing chosen yet. The people are already on the left, so this says which
// action to take rather than offering a button that would duplicate them.
export default function MessagesIndex() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <MessageSquare className="size-6" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-body font-medium text-text-1">Pick someone to write to</p>
        <p className="mt-0.5 text-meta text-text-2">
          Every teammate is in the list, whether or not you have talked before.
        </p>
      </div>
    </div>
  );
}
