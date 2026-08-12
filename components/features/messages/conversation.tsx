"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PersonAvatar } from "@/components/primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  markThreadRead,
  sendDirectMessage,
  unsendDirectMessage,
} from "@/lib/actions/messages";
import { ClockTime } from "@/components/primitives/local-time";
import { fmtDateFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DirectMessage } from "@/lib/types";

// A day separator, the way every chat marks the passing of one.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (same(d, yesterday)) return "Yesterday";
  return fmtDateFull(iso);
}

export function Conversation({
  ws,
  me,
  other,
  initial,
}: {
  ws: string;
  me: string;
  other: { id: string; full_name: string; avatar_url: string | null };
  initial: DirectMessage[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<DirectMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [, startSend] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The server's copy wins whenever the page is re-rendered, so a message
  // sent from another tab is not lost behind local state.
  useEffect(() => setMessages(initial), [initial]);

  // Their messages arrive without a refresh. Notifications already work this
  // way, so the same channel pattern is used rather than a second mechanism.
  useEffect(() => {
    const channel = supabase
      .channel(`dm-${me}-${other.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${me}`,
        },
        (payload) => {
          const row = payload.new as DirectMessage;
          if (row.sender_id !== other.id) return;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
          // Arriving while the thread is open means it has been read.
          void markThreadRead(ws, other.id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, me, other.id, ws]);

  // Anything unread is read the moment the thread is on screen.
  useEffect(() => {
    if (!initial.some((m) => m.recipient_id === me && m.read_at === null)) return;
    void markThreadRead(ws, other.id).then(() => router.refresh());
  }, [initial, me, other.id, router, ws]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    // Drawn straight away, with a temporary id, and replaced by the server's
    // row on the next render. Waiting for a round trip to see your own words
    // is what makes a chat feel broken.
    const pending: DirectMessage = {
      id: `pending-${Date.now()}`,
      workspace_id: "",
      sender_id: me,
      recipient_id: other.id,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, pending]);
    startSend(async () => {
      const res = await sendDirectMessage(ws, other.id, body);
      if (res.error) {
        setMessages((prev) => prev.filter((m) => m.id !== pending.id));
        setDraft((d) => (d ? d : body));
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
    box.current?.focus();
  };

  const unsend = (id: string) => {
    const before = messages;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    void unsendDirectMessage(ws, id).then((res) => {
      if (res.error) {
        setMessages(before);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3">
        <PersonAvatar name={other.full_name} src={other.avatar_url} size={28} />
        <span className="text-sm font-semibold text-text-1">{other.full_name}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-text-3">
            No messages yet. Say hello to {other.full_name.split(" ")[0]}.
          </p>
        ) : null}
        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const newDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === me;
          return (
            <div key={m.id}>
              {newDay ? (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11.5px] font-medium text-text-3">{day}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div
                className={cn("group flex items-end gap-2 py-1", mine && "flex-row-reverse")}
              >
                {!mine ? (
                  <PersonAvatar name={other.full_name} src={other.avatar_url} size={24} />
                ) : null}
                <div
                  className={cn(
                    "max-w-[min(560px,72%)] rounded-[14px] px-3 py-2 text-[13.5px] leading-relaxed",
                    mine
                      ? "bg-brand text-white"
                      : "bg-surface-2 text-text-1"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <ClockTime
                    at={m.created_at}
                    className={cn(
                      "mt-1 block font-mono text-[10.5px] tabular",
                      mine ? "text-white/70" : "text-text-3"
                    )}
                  />
                </div>
                {mine && !m.id.startsWith("pending-") ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Message actions"
                        className="rounded-[7px] p-1 text-text-3 opacity-0 transition-opacity hover:text-text-1 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-4" strokeWidth={1.5} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onSelect={() => unsend(m.id)}>
                        Unsend
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-[12px] border border-border bg-surface px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <textarea
            ref={box}
            rows={1}
            value={draft}
            aria-label={`Write to ${other.full_name}`}
            placeholder={`Write to ${other.full_name.split(" ")[0]}, press Enter to send`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift and Enter makes a new line, which is what
              // every chat this team already uses does.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[13.5px] text-text-1 outline-none placeholder:text-text-3"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send"
            className="rounded-[9px] bg-brand p-1.5 text-white transition-opacity disabled:opacity-40"
          >
            <SendHorizonal className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
