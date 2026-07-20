// Rendering helpers for docs.
//
// The markdown renderer escapes every character of the source first, then adds
// only the tags it generates itself. Nothing an author types can become live
// HTML, so a wiki page cannot carry a script into someone else's session.

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only http(s) and mailto links are allowed through.
function safeHref(raw: string) {
  const url = raw.trim();
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function inline(text: string) {
  let out = escapeHtml(text);
  // `code`
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-surface-2 px-1 py-0.5 text-[12.5px]">$1</code>');
  // **bold** then *italic*
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    const safe = safeHref(href);
    if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noreferrer noopener" class="text-brand hover:underline">${label}</a>`;
  });
  return out;
}

export function renderMarkdown(src: string): string {
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let code: string[] = [];

  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(
          `<pre class="overflow-x-auto rounded-[9px] bg-surface-2 p-3 text-[12.5px]"><code>${escapeHtml(code.join("\n"))}</code></pre>`
        );
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const size = ["text-[20px]", "text-[17px]", "text-[15px]", "text-[14px]"][level - 1];
      html.push(`<h${level} class="${size} mt-4 mb-1 font-semibold text-text-1">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push('<hr class="my-4 border-border" />');
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(
        `<blockquote class="my-2 border-l-2 border-border pl-3 text-text-2">${inline(quote[1])}</blockquote>`
      );
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (list !== "ul") {
        closeList();
        html.push('<ul class="my-2 list-disc pl-5">');
        list = "ul";
      }
      html.push(`<li class="my-0.5">${inline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== "ol") {
        closeList();
        html.push('<ol class="my-2 list-decimal pl-5">');
        list = "ol";
      }
      html.push(`<li class="my-0.5">${inline(ol[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
  }

  if (inCode && code.length) {
    html.push(
      `<pre class="overflow-x-auto rounded-[9px] bg-surface-2 p-3 text-[12.5px]"><code>${escapeHtml(code.join("\n"))}</code></pre>`
    );
  }
  closeList();
  return html.join("");
}

// Google Docs, Sheets, and Slides can be framed through their /preview URL.
// A public document renders inline; a restricted one shows Google's own
// permission notice, which explains itself. Anything else opens in a new tab.
export function googleEmbedUrl(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(
    /^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/
  );
  return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/preview` : null;
}

export function isSafeExternalUrl(raw: string | null): boolean {
  return Boolean(raw && /^https?:\/\//i.test(raw.trim()));
}

// Text formats worth rendering properly rather than dropping in an iframe.
export type TextPreview = "md" | "csv" | "json" | "txt";

export function textPreviewKind(
  fileName: string,
  fileType: string
): TextPreview | null {
  const n = (fileName ?? "").toLowerCase();
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "md";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".json") || /application\/json/i.test(fileType)) return "json";
  if (n.endsWith(".txt") || /^text\/plain/i.test(fileType)) return "txt";
  return null;
}

// Small CSV reader that understands quoted fields and escaped quotes.
export function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function prettyJson(src: string): string {
  try {
    return JSON.stringify(JSON.parse(src), null, 2);
  } catch {
    return src;
  }
}
