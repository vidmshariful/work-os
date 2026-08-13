"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Download, FileIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  uploadProjectFile,
  getFileUrl,
  deleteProjectFile,
  type FileFormState,
} from "@/lib/actions/projects";
import { TimeAgo } from "@/components/primitives/local-time";
import type { ProjectFile } from "./types";

const initialState: FileFormState = { error: null, success: null, stamp: 0 };

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function ProjectFiles({
  ws,
  projectId,
  files,
  canDelete,
}: {
  ws: string;
  projectId: string;
  files: ProjectFile[];
  canDelete: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadProjectFile,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.stamp === 0) return;
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      formRef.current?.reset();
    }
  }, [state]);

  const download = (path: string) => {
    startTransition(async () => {
      const res = await getFileUrl(ws, projectId, path);
      if (res.error || !res.url) toast.error(res.error ?? "Download failed.");
      else window.open(res.url, "_blank", "noopener");
    });
  };

  const remove = (path: string) => {
    startTransition(async () => {
      const res = await deleteProjectFile(ws, projectId, path);
      if (res.error) toast.error(res.error);
      else toast.success("File deleted.");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {files.length === 0 ? (
        <p className="py-2 text-center text-[12.5px] text-text-3">
          No files yet. Upload the first one.
        </p>
      ) : (
        files.map((f) => (
          <div
            key={f.path}
            className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 transition-colors hover:bg-surface-2"
          >
            <FileIcon className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-text-1">
                {f.name}
              </p>
              <p className="text-[11px] text-text-3">
                {fmtSize(f.size)}
                {f.createdAt ? <> · <TimeAgo at={f.createdAt} /></> : null}
              </p>
            </div>
            <button
              onClick={() => download(f.path)}
              aria-label={`Download ${f.name}`}
              className="rounded-[7px] p-1.5 text-text-3 opacity-0 transition-opacity hover:bg-brand-soft hover:text-brand group-hover:opacity-100"
            >
              <Download className="size-3.5" strokeWidth={1.5} />
            </button>
            {canDelete ? (
              <button
                onClick={() => remove(f.path)}
                aria-label={`Delete ${f.name}`}
                className="rounded-[7px] p-1.5 text-text-3 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        ))
      )}
      <form ref={formRef} action={formAction} className="mt-1">
        <input type="hidden" name="ws" value={ws} />
        <input type="hidden" name="project_id" value={projectId} />
        <input
          ref={inputRef}
          type="file"
          name="file"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) formRef.current?.requestSubmit();
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          {pending ? "Uploading" : "Upload file"}
        </Button>
      </form>
    </div>
  );
}
