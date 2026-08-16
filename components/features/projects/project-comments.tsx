"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addProjectComment,
  type ProjectFormState,
} from "@/lib/actions/projects";

const initialState: ProjectFormState = { error: null };

const inputClass =
  "w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

// The post box for a project's thread. Mirrors the task CommentForm so the
// two threads behave identically: clear on success, toast on refusal.
export function ProjectCommentForm({
  ws,
  projectId,
}: {
  ws: string;
  projectId: string;
}) {
  const [state, formAction, pending] = useActionState(
    addProjectComment,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="ws" value={ws} />
      <input type="hidden" name="project_id" value={projectId} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Write a comment"
        className={inputClass}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Posting" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
