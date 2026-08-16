import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

// Labeled form field wrapper. Pair with Input, Select, Textarea from ui/.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-meta font-medium text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-meta font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-meta text-text-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function SearchField({
  placeholder = "Search",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" />
      <input
        type="search"
        placeholder={placeholder}
        className="h-9 w-full rounded-[9px] border border-border bg-surface pl-9 pr-3 text-body text-text-1 outline-none placeholder:text-text-3 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
        {...props}
      />
    </div>
  );
}
