"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// The floating panel a project opens in when you reach it from inside the
// app: the list stays behind it, dimmed, and closing puts you back exactly
// where you were with your scroll position, your filters and your selection
// intact. That is the whole point, and it is why this is an intercepting
// route rather than a component someone remembers to use.
//
// Not the shared Dialog primitive from components/ui. That one is sized for
// a confirmation, centres a small card, and hardcodes a max width. This is
// closer to a document: nearly the full viewport, its own scroll, and a
// header that stays put while the body moves.
export function ProjectModal({
  href,
  children,
}: {
  // Where "open full" goes, and where a middle click should land.
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Closing is a history step back, not a navigation to a guessed URL. Going
  // "back" is what returns the page underneath to the state it was in.
  const close = () => router.back();

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px]",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[min(1120px,calc(100vw-3rem))]",
            "h-[calc(100dvh-4rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "overflow-hidden rounded-[16px] border border-border bg-canvas",
            "shadow-[var(--shadow-pop)] outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98]",
            "data-closed:animate-out data-closed:fade-out-0"
          )}
        >
          {/* A title is required for the dialog to be announced, but the body
              already carries the project name as its h1, so this is for
              screen readers only. */}
          <DialogPrimitive.Title className="sr-only">Project</DialogPrimitive.Title>

          <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border bg-surface px-3 py-2">
            <Link
              href={href}
              aria-label="Open as a full page"
              title="Open as a full page"
              className="rounded-[8px] p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
            >
              <Maximize2 className="size-4" strokeWidth={1.5} />
            </Link>
            <DialogPrimitive.Close
              aria-label="Close"
              className="rounded-[8px] p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text-1"
            >
              <X className="size-4" strokeWidth={1.5} />
            </DialogPrimitive.Close>
          </div>

          {/* The body scrolls, the header does not. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
