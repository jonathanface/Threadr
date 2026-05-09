import type { DemoDraft } from "./types";

export const DEMO_STORAGE_KEY = "threadr_demo_draft";
export const DEMO_PENDING_CONVERSION_KEY = "threadr_demo_pending_conversion";
export const DEMO_SIZE_LIMIT_BYTES = 1_000_000;

export const readDraft = (): DemoDraft | null => {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoDraft;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeDraft = (
  draft: DemoDraft,
): { ok: true } | { ok: false; reason: "size_limit" | "storage_error" } => {
  try {
    const serialized = JSON.stringify(draft);
    if (new Blob([serialized]).size > DEMO_SIZE_LIMIT_BYTES) {
      return { ok: false, reason: "size_limit" };
    }
    localStorage.setItem(DEMO_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage_error" };
  }
};

export const clearDraft = (): void => {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const getDraftByteSize = (draft: DemoDraft): number =>
  new Blob([JSON.stringify(draft)]).size;
