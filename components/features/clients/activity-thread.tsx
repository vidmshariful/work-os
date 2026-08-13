"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/primitives/avatar";
import { TimeAgo } from "@/components/primitives/local-time";
import { postClientMessage, type WorkroomState } from "@/lib/actions/client-work";
import type { ClientActivity } from "@/lib/types";

const initialState: WorkroomState = { error: null };

export interface ThreadPerson {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

// The client workroom thread: team messages and system events on one
// timeline. Type @ to mention an above-wall teammate; mentions notify.
export function ActivityThread({
  ws,
  clientId,
  items,
  people,
}: {
  ws: string;
  clientId: string;
  items: ClientActivity[];
  people: ThreadPerson[];
}) {
  const [state, formAction, pending] = useActionState(postClientMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const personById = new Map(people.map((p) => [p.id, p]));

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else {
      formRef.current?.reset();
      setMentioned([]);
    }
  }, [state]);

  const onInput = () => {
    const el = textRef.current;
    if (!el) return;
    const upToCaret = el.value.slice(0, el.selectionStart ?? el.value.length);
    const match = upToCaret.match(/@([\w ]{0,20})$/);
    if (match) {
      setMentionOpen(true);
      setMentionQuery(match[1].toLowerCase());
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (person: ThreadPerson) => {
    const el = textRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(/@([\w ]{0,20})$/, `@${person.full_name} `);
    el.value = before + el.value.slice(caret);
    setMentioned((ids) => (ids.includes(person.id) ? ids : [...ids, person.id]));
    setMentionOpen(false);
    el.focus();
  };

  const candidates = people.filter((p) =>
    p.full_name.toLowerCase().includes(mentionQuery)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3.5">
        {items.length === 0 ? (
          <p className="py-3 text-center text-[12.5px] text-text-3">
            The story of this client starts here.
          </p>
        ) : (
          items.map((item) => {
            if (item.kind === "system") {
              return (
                <div key={item.id} className="flex items-center gap-2.5 px-1">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-chip-gray">
                    <Zap className="size-3 text-text-3" strokeWidth={1.5} />
                  </span>
                  <p className="text-[12.5px] text-text-2">
                    {item.body}{" "}
                    <span className="text-text-3"><TimeAgo at={item.created_at} /></span>
                  </p>
                </div>
              );
            }
            const author = item.author_id ? personById.get(item.author_id) : null;
            return (
              <div key={item.id} className="flex gap-2.5">
                <PersonAvatar
                  name={author?.full_name}
                  src={author?.avatar_url}
                  size={28}
                />
                <div className="min-w-0 flex-1 rounded-[10px] bg-surface-2 px-3 py-2">
                  <p className="text-[12px]">
                    <span className="font-medium text-text-1">
                      {author?.full_name ?? "Someone"}
                    </span>{" "}
                    <span className="text-text-3"><TimeAgo at={item.created_at} /></span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text-1">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form ref={formRef} action={formAction} className="relative flex flex-col gap-2">
        <input type="hidden" name="ws" value={ws} />
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="mentioned" value={mentioned.join(",")} />
        {mentionOpen && candidates.length > 0 ? (
          <div className="absolute bottom-full left-0 z-10 mb-1 w-60 rounded-[10px] border border-border bg-surface p-1 shadow-[var(--shadow-pop)]">
            {candidates.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => insertMention(p)}
                className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] text-text-1 hover:bg-surface-2"
              >
                <PersonAvatar name={p.full_name} src={p.avatar_url} size={20} />
                {p.full_name}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textRef}
          name="body"
          rows={2}
          required
          placeholder="Write to the team. Type @ to mention someone."
          onInput={onInput}
          className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Posting" : "Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
