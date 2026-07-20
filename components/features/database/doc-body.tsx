"use client";

import { useRef, useState, useTransition } from "react";
import { Download, ExternalLink, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/primitives/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateDoc } from "@/lib/actions/docs";
import {
  renderMarkdown,
  googleEmbedUrl,
  parseCsv,
  prettyJson,
  type TextPreview,
} from "@/lib/doc-render";

// Inline-editable doc title.
export function DocTitle({
  ws,
  docId,
  title,
  canEdit,
}: {
  ws: string;
  docId: string;
  title: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(title);
  const saved = useRef(title);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  if (!canEdit) {
    return (
      <h1 className="text-[26px] font-semibold tracking-tight text-text-1">{title}</h1>
    );
  }

  const save = () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === saved.current) {
      setValue(saved.current);
      return;
    }
    saved.current = next;
    start(async () => {
      const res = await updateDoc(ws, docId, { title: next });
      if (res.error) {
        toast.error(res.error);
        setValue(title);
      }
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setValue(saved.current);
            setEditing(false);
          }
        }}
        className="w-full rounded-[9px] border border-border bg-surface px-2 py-1 text-[26px] font-semibold tracking-tight text-text-1 outline-none focus-visible:border-brand"
      />
    );
  }

  return (
    <h1
      onClick={() => setEditing(true)}
      className="cursor-text text-[26px] font-semibold tracking-tight text-text-1"
    >
      {title}
    </h1>
  );
}

// ---- a page written in the app ----
// Markdown source, rendered through an escaping renderer, so nothing an author
// types can execute in a reader's session.
export function DocPage({
  ws,
  docId,
  content,
  canEdit,
}: {
  ws: string;
  docId: string;
  content: string;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(content ?? "");
  const saved = useRef(content ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const save = () => {
    if (value === saved.current) return;
    const next = value;
    saved.current = next;
    start(async () => {
      const res = await updateDoc(ws, docId, { content: next });
      if (res.error) toast.error(res.error);
    });
  };

  if (!canEdit || !editing) {
    return (
      <Card className="p-6">
        {canEdit ? (
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          </div>
        ) : null}
        {value.trim() ? (
          <div
            className="text-[14px] text-text-1"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
          />
        ) : (
          <p className="text-[13px] text-text-3">
            This page is empty{canEdit ? ". Choose Edit to start writing." : "."}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12.5px] text-text-3">
          Markdown. Headings, lists, links, bold, and code are supported.
        </span>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            save();
            setEditing(false);
          }}
        >
          <Eye />
          Done
        </Button>
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={18}
        placeholder={"# Tech stack\n\n- **Frontend**: Next.js\n- **Database**: Postgres\n\n[Docs](https://example.com)"}
        className="w-full resize-y rounded-[9px] border border-border bg-surface p-3 font-mono text-[13px] leading-relaxed text-text-1 outline-none focus-visible:border-brand"
      />
    </Card>
  );
}

// ---- an uploaded file ----
// The signed URL is generated server-side and expires. HTML is framed with a
// locked-down sandbox so an uploaded page cannot run scripts or reach the app.
export function DocFile({
  fileName,
  fileType,
  url,
  text,
  textKind,
}: {
  fileName: string;
  fileType: string;
  url: string | null;
  text?: string | null;
  textKind?: TextPreview | null;
}) {
  if (!url) {
    return (
      <Card className="p-6 text-center text-[13px] text-text-3">
        The preview link could not be prepared. Try reloading.
      </Card>
    );
  }

  const isHtml = /html/i.test(fileType) || /\.html?$/i.test(fileName);
  const isPdf = /pdf/i.test(fileType) || /\.pdf$/i.test(fileName);
  const isImage = /^image\//i.test(fileType) || /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
  const isText = /^text\//i.test(fileType) || /\.(txt|md|csv|json)$/i.test(fileName);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12.5px] text-text-2">{fileName}</span>
        <Button variant="outline" size="sm" asChild>
          <a href={url} download={fileName} target="_blank" rel="noreferrer">
            <Download />
            Download
          </a>
        </Button>
      </div>

      {textKind && text != null ? (
        <Card className="overflow-x-auto p-5">
          {textKind === "md" ? (
            <div
              className="text-[14px] text-text-1"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
            />
          ) : textKind === "csv" ? (
            <table className="w-full min-w-max border-collapse text-[13px]">
              <tbody>
                {parseCsv(text).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={cn(
                          "border-r border-border px-3 py-1.5 last:border-r-0",
                          i === 0 && "bg-surface-2 font-semibold text-text-1"
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-text-1">
              {textKind === "json" ? prettyJson(text) : text}
            </pre>
          )}
        </Card>
      ) : isImage ? (
        <Card className="flex justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={fileName} className="max-h-[70vh] max-w-full rounded-[9px]" />
        </Card>
      ) : isHtml || isPdf || isText ? (
        <Card className="overflow-hidden p-0">
          <iframe
            src={url}
            title={fileName}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-[70vh] w-full border-0 bg-white"
          />
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-[13px] text-text-2">
            This format has no in-app preview. Download it to open.
          </p>
        </Card>
      )}
    </div>
  );
}

// ---- an external link ----
export function DocLink({ url }: { url: string }) {
  const embed = googleEmbedUrl(url);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[12.5px] text-text-2">{url}</span>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer noopener">
            <ExternalLink />
            Open in new window
          </a>
        </Button>
      </div>
      {embed ? (
        <Card className="overflow-hidden p-0">
          <iframe
            src={embed}
            title="Document preview"
            referrerPolicy="no-referrer"
            className={cn("h-[70vh] w-full border-0 bg-white")}
          />
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-[13px] text-text-2">
            This link opens in a new window. Google Docs, Sheets, and Slides
            preview here when they are shared publicly.
          </p>
        </Card>
      )}
    </div>
  );
}
