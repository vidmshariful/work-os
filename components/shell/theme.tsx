"use client";

import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// next-themes writes the class onto <html> before paint, using a script it
// injects itself, which is what stops a light flash on a dark-mode reload.
// The html element therefore differs between server and client render, and
// suppressHydrationWarning on <html> in app/layout.tsx is what makes that
// legal rather than a console error.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Colour transitions on every surface at once read as a flash rather
      // than a fade, so the switch is instant on purpose.
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

// Three states, not two. A plain on/off switch cannot express "follow the
// machine", which is what most people actually want and what the default is.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Before the provider has read localStorage, theme is undefined. Drawing
  // the sun then swapping to the moon is worse than drawing the icon the
  // page is already painted in, which resolvedTheme gives us.
  const Icon = (resolvedTheme === "dark" ? Moon : Sun);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          className={cn(
            "flex size-8 items-center justify-center rounded-[9px] text-text-2 outline-none transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:ring-2 focus-visible:ring-brand/40",
            className
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => setTheme(o.value)}
            className={cn(theme === o.value && "font-medium text-text-1")}
          >
            <o.icon strokeWidth={1.5} />
            {o.label}
            {theme === o.value ? (
              <span className="ml-auto size-1.5 rounded-full bg-brand" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
