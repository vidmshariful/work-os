"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, MoreHorizontal, RotateCw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/primitives/field";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { ARCHETYPE_META, ARCHETYPES } from "@/components/features/team/labels";
import {
  invitePerson,
  reactivatePerson,
  resendInvite,
  revokeInvite,
  type PeopleState,
} from "@/lib/actions/people";

const initial: PeopleState = { error: null };

const inputClass =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// The link is the fallback that always works. Studio mail may not be wired up
// to deliver an invitation, so the admin is handed the link either way and can
// send it however they normally reach the person.
function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[10px] border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-meta font-medium text-text-1">
        <Link2 className="size-3.5 text-text-3" strokeWidth={1.5} />
        Their invitation link
      </div>
      <p className="mt-1 text-meta text-text-2">
        Send this to them. It signs them in once so they can set their own
        password, and it stops working after that.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[7px] border border-border bg-surface px-2 py-1.5 font-mono text-micro text-text-2">
          {link}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              toast.error("Copying was blocked. Select the link and copy it by hand.");
            }
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function InviteDialog({
  ws,
  members,
}: {
  ws: string;
  members: { id: string; full_name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(invitePerson, initial);
  const [archetype, setArchetype] = useState("contributor");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setArchetype("contributor");
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Invite person
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite someone to the workspace</DialogTitle>
        </DialogHeader>

        {state.link ? (
          <div className="flex flex-col gap-4">
            <InviteLink link={state.link} />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="ws" value={ws} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="inv_name">
                <input id="inv_name" name="full_name" autoFocus required className={inputClass} placeholder="Ayesha Karim" />
              </Field>
              <Field label="Email" htmlFor="inv_email">
                <input id="inv_email" name="email" type="email" required className={inputClass} placeholder="ayesha@vidiosa.com" />
              </Field>
            </div>

            <Field label="Job title" htmlFor="inv_role" hint="What they are called day to day.">
              <select id="inv_role" name="role" className={inputClass} defaultValue="designer">
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>

            <Field label="Access level" htmlFor="inv_arch" hint="What the app actually lets them do.">
              <select
                id="inv_arch"
                name="archetype"
                className={inputClass}
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
              >
                {ARCHETYPES.map((a) => (
                  <option key={a} value={a}>{ARCHETYPE_META[a].label}</option>
                ))}
              </select>
            </Field>
            {/* The sentence under the picker, so nobody has to guess what a
                level means at the moment they are choosing one. */}
            <p className="-mt-2 text-meta text-text-2">
              {ARCHETYPE_META[archetype as keyof typeof ARCHETYPE_META]?.blurb}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client names" htmlFor="inv_wall" hint="Above the wall sees names and money.">
                <select id="inv_wall" name="wall_side" className={inputClass} defaultValue="below">
                  <option value="below">Codes only</option>
                  <option value="above">Full client detail</option>
                </select>
              </Field>
              <Field label="Reports to" htmlFor="inv_reports" hint="Who approves their leave.">
                <select id="inv_reports" name="reports_to" className={inputClass} defaultValue="">
                  <option value="">Nobody</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </Field>
            </div>

            {state.error ? (
              <p className="rounded-[9px] bg-danger-soft px-3 py-2 text-meta font-medium text-danger">
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Inviting" : "Send invitation"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// What you can do to one row, which depends entirely on where that person is:
// an outstanding invitation can be resent or taken back, somebody who has
// signed in can only be deactivated, and somebody deactivated can come back.
export function PersonRowActions({
  ws,
  profileId,
  name,
  status,
  isSelf,
}: {
  ws: string;
  profileId: string;
  name: string;
  status: "active" | "invited" | "deactivated";
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const run = (fn: () => Promise<PeopleState>, confirmWith?: string) => {
    if (confirmWith && !window.confirm(confirmWith)) return;
    start(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.link) setLink(res.link);
      toast.success(res.success ?? "Done.");
    });
  };

  if (isSelf) return <span className="text-meta text-text-3">You</span>;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {status === "invited" ? (
            <>
              <DropdownMenuItem onSelect={() => run(() => resendInvite(ws, profileId))}>
                <RotateCw />
                New invitation link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  run(
                    () => revokeInvite(ws, profileId),
                    `Take back the invitation for ${name}? They have never signed in, so nothing of theirs is lost.`
                  )
                }
              >
                <X />
                Revoke invitation
              </DropdownMenuItem>
            </>
          ) : null}
          {status === "deactivated" ? (
            <DropdownMenuItem onSelect={() => run(() => reactivatePerson(ws, profileId))}>
              <RotateCw />
              Reactivate
            </DropdownMenuItem>
          ) : null}
          {status === "active" ? (
            <DropdownMenuItem disabled>
              Use the Active switch to deactivate
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invitation link for {name}</DialogTitle>
          </DialogHeader>
          {link ? <InviteLink link={link} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
