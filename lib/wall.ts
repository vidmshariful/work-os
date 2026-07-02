// Helpers for reading masked client data. Below the wall the commercial
// fields of v_clients arrive as null, and the code is the identity. These
// helpers keep every screen consistent about that.
import type { VClient } from "@/lib/types";

// The display label for a client anywhere in the UI. Above the wall this is
// the commercial name. Below the wall it is the code, which is simply what a
// client is down there. Never render a placeholder like "hidden" or a lock.
export function clientLabel(client: Pick<VClient, "code" | "commercial_name">) {
  return client.commercial_name ?? client.code;
}

// True when this read came back unmasked, meaning the viewer is above the
// wall. Drives above-wall-only UI like the Confidential chip.
export function isUnmasked(client: Pick<VClient, "commercial_name">) {
  return client.commercial_name !== null;
}

// The confidential marker shows only above the wall, and only for clients
// that belong to a niche brand.
export function isConfidential(client: Pick<VClient, "origin">) {
  return client.origin !== null && client.origin !== "direct";
}

export const ORIGIN_LABELS: Record<string, string> = {
  direct: "Direct",
  ghl_video: "GHL Video",
  ghl_animation: "GHL Animation",
};
