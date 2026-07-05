"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtTimeAgo } from "@/lib/format";
import {
  markIntakeReceived,
  markIntakeSent,
  scaffoldKickoffNow,
  updateClientStage,
} from "@/lib/actions/clients";
import type { ClientStage, VClient } from "@/lib/types";
import { STAGE_META, STAGE_ORDER } from "./stage";

const inputClass =
  "h-8 w-full rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand";

// Intake drives the start of work: when kickoff timing is on_intake, the
// database scaffolds the first project the moment intake is marked received.
export function IntakeCard({ ws, client }: { ws: string; client: VClient }) {
  const [pending, startTransition] = useTransition();
  const [formUrl, setFormUrl] = useState(client.intake_form_url ?? "");
  const [responseUrl, setResponseUrl] = useState("");

  const status = client.intake_status ?? "not_sent";
  const steps = [
    { key: "not_sent", label: "Paid" },
    { key: "sent", label: "Intake sent" },
    { key: "received", label: "Intake received" },
  ];
  const stepIndex = status === "received" ? 2 : status === "sent" ? 1 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {steps.map((step, i) => (
          <span key={step.key} className="flex flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1 rounded-full",
                i <= stepIndex ? "bg-brand" : "bg-chip-gray"
              )}
            />
            <span
              className={cn(
                "text-[10.5px] font-medium",
                i <= stepIndex ? "text-text-1" : "text-text-3"
              )}
            >
              {step.label}
            </span>
          </span>
        ))}
      </div>

      {status === "not_sent" ? (
        <div className="flex flex-col gap-2">
          <input
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder="Intake form link"
            className={inputClass}
          />
          <Button
            size="sm"
            disabled={pending || !formUrl.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await markIntakeSent(ws, client.id, formUrl);
                if (res.error) toast.error(res.error);
                else toast.success("Intake marked sent.");
              })
            }
          >
            <Send />
            Mark intake sent
          </Button>
        </div>
      ) : null}

      {status === "sent" ? (
        <div className="flex flex-col gap-2">
          {client.intake_form_url ? (
            <a
              href={client.intake_form_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Intake form
              {client.intake_sent_at ? (
                <span className="font-normal text-text-3">
                  sent {fmtTimeAgo(client.intake_sent_at)}
                </span>
              ) : null}
            </a>
          ) : null}
          <input
            value={responseUrl}
            onChange={(e) => setResponseUrl(e.target.value)}
            placeholder="Response link, optional"
            className={inputClass}
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await markIntakeReceived(ws, client.id, responseUrl);
                if (res.error) toast.error(res.error);
                else
                  toast.success(
                    client.kickoff_timing === "on_intake" && !client.kickoff_done
                      ? "Intake received. The kickoff project is being scaffolded."
                      : "Intake received."
                  );
              })
            }
          >
            <Check />
            Mark intake received
          </Button>
          {client.kickoff_timing === "on_intake" && !client.kickoff_done ? (
            <p className="text-[11.5px] text-text-3">
              Receiving intake scaffolds the kickoff project automatically.
            </p>
          ) : null}
        </div>
      ) : null}

      {status === "received" ? (
        <div className="flex flex-col gap-2 text-[12.5px] text-text-2">
          <p>
            Received{" "}
            {client.intake_received_at ? fmtTimeAgo(client.intake_received_at) : ""}.
            {client.intake_response_url ? (
              <>
                {" "}
                <a
                  href={client.intake_response_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  View responses
                </a>
              </>
            ) : null}
          </p>
          {!client.kickoff_done && client.stage !== "blacklist" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await scaffoldKickoffNow(ws, client.id);
                  if (res.error) toast.error(res.error);
                  else toast.success("Kickoff project scaffolded.");
                })
              }
            >
              Scaffold kickoff project
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Quick stage mover on the profile header.
export function StageSelect({
  ws,
  clientId,
  stage,
}: {
  ws: string;
  clientId: string;
  stage: ClientStage;
}) {
  const [value, setValue] = useState<ClientStage>(stage);
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Client stage"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ClientStage;
        const prev = value;
        setValue(next);
        startTransition(async () => {
          const res = await updateClientStage(ws, clientId, next);
          if (res.error) {
            setValue(prev);
            toast.error(res.error);
          }
        });
      }}
      className="h-8 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] font-medium text-text-1 outline-none focus-visible:border-brand"
    >
      {STAGE_ORDER.map((s) => (
        <option key={s} value={s}>
          {STAGE_META[s].label}
        </option>
      ))}
    </select>
  );
}
