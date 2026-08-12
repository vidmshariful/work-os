"use client";

import { useEffect, useState } from "react";
import { fmtTimeAgo } from "@/lib/format";

// A time that only the browser can get right.
//
// "4 minutes ago" and a clock reading are both computed from a clock and a
// timezone, and the server has different ones: it renders at a different
// instant, and on a deployed host it is very likely in a different zone from
// the person reading. Rendering either directly puts one string in the HTML
// and another in the browser, which React reports as a hydration failure and
// answers by throwing the server's markup away and rebuilding the tree.
// Verified here: a message list with a fresh timestamp did exactly that.
//
// So the element says it may differ, and a state flip after mount forces one
// re-render, which is what replaces the server's guess with the reader's own
// clock. suppressHydrationWarning alone would keep the server's string.
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function TimeAgo({ at, className }: { at: string; className?: string }) {
  useMounted();
  return (
    <time dateTime={at} suppressHydrationWarning className={className}>
      {fmtTimeAgo(at)}
    </time>
  );
}

export function ClockTime({ at, className }: { at: string; className?: string }) {
  useMounted();
  return (
    <time dateTime={at} suppressHydrationWarning className={className}>
      {new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
