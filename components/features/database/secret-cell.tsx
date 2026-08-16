"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { revealSecret, updateCell } from "@/lib/actions/database";
import { cn } from "@/lib/utils";
import { SECRET_PRESENT } from "@/lib/types";

// One stored credential in the grid. The page never sends the value here, so
// this component starts with nothing but the knowledge that something is
// stored. Revealing asks the server, which checks access and writes the
// reveal to secret_reveals before answering.

// A revealed value goes back behind the dots on its own. Somebody reads a
// password, switches to another window, and the screen should not still be
// showing it when they come back or when a colleague walks past.
const HIDE_AFTER_MS = 30_000;

export function SecretCell({
  ws,
  tableId,
  rowId,
  fieldId,
  fieldName,
  value,
  canEdit,
}: {
  ws: string;
  tableId: string;
  rowId: string;
  fieldId: string;
  fieldName: string;
  value: unknown;
  canEdit: boolean;
}) {
  const stored = value === SECRET_PRESENT || (value != null && value !== "");
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function armHide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), HIDE_AFTER_MS);
  }

  async function fetchValue(action: "reveal" | "copy") {
    setBusy(true);
    setError(null);
    const res = await revealSecret(ws, tableId, rowId, fieldId, action);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return null;
    }
    return res.value ?? "";
  }

  async function onReveal() {
    if (shown !== null) {
      setShown(null);
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    const v = await fetchValue("reveal");
    if (v !== null) {
      setShown(v);
      armHide();
    }
  }

  async function onCopy() {
    const v = await fetchValue("copy");
    if (v === null) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused, usually because the page is not focused. Showing
      // the value is the fallback that still gets the person their password.
      setShown(v);
      armHide();
    }
  }

  async function onSave() {
    const next = draft;
    setBusy(true);
    const res = await updateCell(ws, tableId, rowId, fieldId, next);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDraft("");
    setEditing(false);
    setShown(null);
  }

  if (editing) {
    return (
      <span className="flex h-9 items-center gap-1 px-2">
        <input
          autoFocus
          type="password"
          value={draft}
          aria-label={`New value for ${fieldName}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") {
              setEditing(false);
              setDraft("");
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-[7px] border border-brand bg-surface px-2 font-mono text-[12.5px] text-text-1 outline-none"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-[6px] px-1.5 py-1 text-[12px] font-medium text-brand hover:bg-nav-active"
        >
          Save
        </button>
      </span>
    );
  }

  if (!stored) {
    return canEdit ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-9 w-full items-center px-3 text-left text-[13px] text-text-3 hover:text-text-1"
      >
        Set
      </button>
    ) : (
      <span className="block px-3 py-2 text-[13px] text-text-3">Set</span>
    );
  }

  return (
    <span className="group/secret flex h-9 items-center gap-1 px-3">
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[12.5px]",
          shown === null ? "tracking-[0.18em] text-text-2" : "text-text-1"
        )}
      >
        {shown === null ? "••••••••" : shown === "" ? "—" : shown}
      </span>
      {busy ? <Loader2 className="size-3.5 animate-spin text-text-3" /> : null}
      <button
        type="button"
        onClick={onReveal}
        aria-label={shown === null ? `Reveal ${fieldName}` : `Hide ${fieldName}`}
        className="rounded-[6px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover/secret:opacity-100"
      >
        {shown === null ? (
          <Eye className="size-3.5" strokeWidth={1.5} />
        ) : (
          <EyeOff className="size-3.5" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${fieldName}`}
        className="rounded-[6px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover/secret:opacity-100"
      >
        {copied ? (
          <Check className="size-3.5 text-success" strokeWidth={1.75} />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.5} />
        )}
      </button>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-[6px] px-1 py-1 text-[11.5px] text-text-3 opacity-0 transition-opacity hover:text-text-1 focus-visible:opacity-100 group-hover/secret:opacity-100"
        >
          Replace
        </button>
      ) : null}
      {error ? <span className="truncate text-[11.5px] text-danger">{error}</span> : null}
    </span>
  );
}
