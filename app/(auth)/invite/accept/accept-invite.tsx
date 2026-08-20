"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Turns whatever the invitation link carried into a session, then sends the
// person on to choose a password. Two shapes have to be handled, because
// Supabase uses whichever fits how the link was made:
//
//   #access_token=...&refresh_token=...   an admin generated link, no verifier
//   ?code=...                             a flow the browser itself started
//
// The fragment is the one that matters here and the one a server route can
// never see, which is why this runs in the browser.
export function AcceptInvite() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (cancelled) return;
        if (!error) {
          // Drop the tokens out of the address bar before moving on, so they
          // are not left sitting in history or in a shared screen.
          window.history.replaceState(null, "", window.location.pathname);
          router.replace("/reset/update");
          return;
        }
      }

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!error) {
          router.replace("/reset/update");
          return;
        }
      }

      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (failed) {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-5 text-center">
        <p className="text-body font-medium text-text-1">
          That invitation link has expired.
        </p>
        <p className="page-subtitle mt-1">
          They are good for a single use. Ask whoever invited you to send a
          fresh one.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-body font-medium text-brand hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-border bg-surface p-5 text-center">
      <p className="text-body text-text-2">Checking your invitation.</p>
    </div>
  );
}
