"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/primitives/tag";
import { cn } from "@/lib/utils";
import { fmtTimeAgo } from "@/lib/format";
import {
  markProjectIntakeSent,
  markProjectIntakeReceived,
  updateIntakeResponse,
  type IntakeActionState,
} from "@/lib/actions/project-intake";
import type { ProjectIntake } from "@/lib/types";

const initialState: IntakeActionState = { error: null };

const inputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand";

export function IntakeStatusTag({ status }: { status: ProjectIntake["status"] }) {
  if (status === "received") return <Tag tone="green">Intake received</Tag>;
  if (status === "sent") return <Tag tone="amber">Intake sent</Tag>;
  return <Tag tone="gray">Intake not sent</Tag>;
}

function ResponseForm({
  ws,
  projectId,
  clientId,
  intake,
  mode,
  onDone,
}: {
  ws: string;
  projectId: string;
  clientId: string | null;
  intake: ProjectIntake;
  mode: "receive" | "edit";
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "receive" ? markProjectIntakeReceived : updateIntakeResponse,
    initialState
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.success) {
      toast.success(state.success);
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      <input
        name="response_url"
        defaultValue={intake.response_url ?? ""}
        placeholder="Response link, optional"
        className={inputClass}
      />
      <textarea
        name="response_note"
        rows={4}
        defaultValue={intake.response_note ?? ""}
        placeholder="Paste what they submitted: goals, audience, style, references."
        className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : mode === "receive" ? "Mark received" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// The intake lifecycle for one project: send the form, record what came
// back, keep the submission readable where the work happens. Above-wall
// surface; RLS guarantees it.
export function ProjectIntakePanel({
  ws,
  projectId,
  clientId,
  intake,
}: {
  ws: string;
  projectId: string;
  clientId: string | null;
  intake: ProjectIntake;
}) {
  const [pending, startTransition] = useTransition();
  const [formUrl, setFormUrl] = useState(intake.form_url ?? "");
  const [editing, setEditing] = useState<null | "receive" | "edit">(null);

  if (intake.status === "not_sent" && editing === null) {
    return (
      <div className="flex flex-col gap-2">
        <input
          value={formUrl}
          onChange={(e) => setFormUrl(e.target.value)}
          placeholder="Intake form link"
          className={inputClass}
        />
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={pending || !formUrl.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await markProjectIntakeSent(ws, projectId, clientId, formUrl);
                if (res.error) toast.error(res.error);
                else toast.success(res.success ?? "Done.");
              })
            }
          >
            <Send />
            Mark sent
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing("receive")}>
            Skip to received
          </Button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <ResponseForm
        ws={ws}
        projectId={projectId}
        clientId={clientId}
        intake={intake}
        mode={editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  if (intake.status === "sent") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[12.5px] text-text-2">
          Sent {intake.sent_at ? fmtTimeAgo(intake.sent_at) : ""}.
          {intake.form_url ? (
            <>
              {" "}
              <a
                href={intake.form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline"
              >
                Open form
              </a>
            </>
          ) : null}
        </p>
        <Button size="sm" onClick={() => setEditing("receive")}>
          <Check />
          Mark received
        </Button>
      </div>
    );
  }

  // received: the submission area
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "rounded-[10px] border border-border bg-surface-2 px-3 py-2.5",
          !intake.response_note && !intake.response_url && "text-center"
        )}
      >
        {intake.response_note ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-1">
            {intake.response_note}
          </p>
        ) : (
          <p className="text-[12.5px] text-text-3">
            Received, no summary pasted yet.
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-text-3">
          <span>Received {intake.received_at ? fmtTimeAgo(intake.received_at) : ""}</span>
          {intake.response_url ? (
            <a
              href={intake.response_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              <ExternalLink className="size-3" />
              Full response
            </a>
          ) : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setEditing("edit")}
      >
        <Pencil />
        Edit submission
      </Button>
    </div>
  );
}
