"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  offboardPerson,
  updateReportsTo,
} from "@/lib/actions/team";



export function ReportsToSelect({
  ws,
  profileId,
  reportsTo,
  members,
}: {
  ws: string;
  profileId: string;
  reportsTo: string | null;
  members: { id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Reports to"
      className="h-8 rounded-[9px] border border-border bg-surface px-2 text-meta text-text-1 outline-none focus-visible:border-brand"
      value={reportsTo ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await updateReportsTo(ws, profileId, e.target.value || null);
          if (res.error) toast.error(res.error);
          else toast.success(res.success ?? "Saved.");
        })
      }
    >
      <option value="">Nobody</option>
      {members
        .filter((m) => m.id !== profileId)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
    </select>
  );
}

export function OffboardButton({
  ws,
  profileId,
  name,
}: {
  ws: string;
  profileId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Offboard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Offboard {name}?</DialogTitle>
        </DialogHeader>
        <p className="text-body text-text-2">
          Their membership is deactivated and they lose access on their next
          request. Their work history stays.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep active
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await offboardPerson(ws, profileId);
                if (res.error) toast.error(res.error);
                else {
                  toast.success(res.success ?? "Done.");
                  setOpen(false);
                }
              })
            }
          >
            {pending ? "Offboarding" : "Offboard"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
