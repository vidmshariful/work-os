"use client";

// General workspace settings. One row in workspace_settings, read by every
// screen through lib/data/workspace-settings.ts, so a change here is already
// true for every member on their next read. Nothing is copied per account.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateWorkspaceSettings } from "@/lib/actions/admin";
import { SettingRow, controlInputClass, controlSelectClass } from "./control-rows";
import type { WorkspaceSettings } from "@/lib/types";

// A short list of the timezones this studio actually works across, plus
// whatever is already saved, so an admin is never forced to scroll the world.
const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-AU", label: "English (Australia)" },
];

export function GeneralSettingsForm({
  ws,
  settings,
  workspaceName,
}: {
  ws: string;
  settings: WorkspaceSettings;
  workspaceName: string;
}) {
  const [displayName, setDisplayName] = useState(
    settings.display_name ?? workspaceName
  );
  const [timezone, setTimezone] = useState(settings.timezone);
  const [weekStart, setWeekStart] = useState(String(settings.week_start_day));
  const [locale, setLocale] = useState(settings.locale);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url ?? "");
  const [pending, startTransition] = useTransition();

  const timezoneOptions = TIMEZONES.includes(timezone)
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  const save = () =>
    startTransition(async () => {
      const res = await updateWorkspaceSettings(ws, {
        display_name: displayName,
        timezone,
        week_start_day: Number(weekStart),
        locale,
        logo_url: logoUrl,
      });
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else toast.success("Settings updated.");
    });

  return (
    <div className="flex flex-col">
      <SettingRow
        label="Display name"
        description="What members see at the top of the sidebar."
        htmlFor="setting-display-name"
        control={
          <input
            id="setting-display-name"
            className={controlInputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        }
      />
      <SettingRow
        label="Timezone"
        description="Used when a date is shown as today or tomorrow."
        htmlFor="setting-timezone"
        control={
          <select
            id="setting-timezone"
            className={controlSelectClass}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        }
      />
      <SettingRow
        label="Week starts on"
        description="The first column of every calendar and board grouped by week."
        htmlFor="setting-week-start"
        control={
          <select
            id="setting-week-start"
            className={controlSelectClass}
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={String(i)}>
                {day}
              </option>
            ))}
          </select>
        }
      />
      <SettingRow
        label="Locale"
        description="How dates and numbers are formatted."
        htmlFor="setting-locale"
        control={
          <select
            id="setting-locale"
            className={controlSelectClass}
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            {LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        }
      />
      <SettingRow
        label="Logo URL"
        description="Optional. Leave empty to show the workspace initial."
        htmlFor="setting-logo-url"
        control={
          <input
            id="setting-logo-url"
            className={controlInputClass}
            placeholder="https://"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        }
      />
      <div className="pt-4">
        <Button id="setting-save" disabled={pending} onClick={save}>
          {pending ? "Saving" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
