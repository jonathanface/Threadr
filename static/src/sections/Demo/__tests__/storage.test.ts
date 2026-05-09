import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SIZE_LIMIT_BYTES,
  DEMO_STORAGE_KEY,
  clearDraft,
  getDraftByteSize,
  readDraft,
  writeDraft,
} from "../storage";
import type { DemoDraft } from "../types";

const sampleDraft = (overrides: Partial<DemoDraft> = {}): DemoDraft => ({
  version: 1,
  title: "Sample",
  lexical_state: '{"root":{"children":[],"type":"root","version":1}}',
  associations: [
    {
      client_id: "abc-123",
      name: "Mina",
      type: "character",
      short_description: "",
      extended_description: "",
    },
  ],
  updated_at: new Date("2026-05-08T12:00:00Z").toISOString(),
  ...overrides,
});

describe("Demo storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips a draft through write and read", () => {
    const draft = sampleDraft();
    const result = writeDraft(draft);
    expect(result.ok).toBe(true);

    const loaded = readDraft();
    expect(loaded).toEqual(draft);
  });

  it("returns null when nothing is stored", () => {
    expect(readDraft()).toBeNull();
  });

  it("returns null when the stored value is invalid JSON", () => {
    localStorage.setItem(DEMO_STORAGE_KEY, "{not valid json");
    expect(readDraft()).toBeNull();
  });

  it("returns null when the stored value has an unknown version", () => {
    localStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ ...sampleDraft(), version: 99 }),
    );
    expect(readDraft()).toBeNull();
  });

  it("refuses to write drafts larger than the size limit", () => {
    const huge = sampleDraft({
      lexical_state: "x".repeat(DEMO_SIZE_LIMIT_BYTES + 1),
    });
    const result = writeDraft(huge);
    expect(result).toEqual({ ok: false, reason: "size_limit" });
    expect(readDraft()).toBeNull();
  });

  it("preserves a previously-stored draft when an oversized write is rejected", () => {
    const small = sampleDraft({ title: "Keep me" });
    expect(writeDraft(small).ok).toBe(true);

    const huge = sampleDraft({
      lexical_state: "x".repeat(DEMO_SIZE_LIMIT_BYTES + 1),
    });
    expect(writeDraft(huge).ok).toBe(false);

    expect(readDraft()?.title).toBe("Keep me");
  });

  it("clearDraft removes the stored draft", () => {
    writeDraft(sampleDraft());
    clearDraft();
    expect(readDraft()).toBeNull();
  });

  it("getDraftByteSize reports the serialized size", () => {
    const draft = sampleDraft();
    const size = getDraftByteSize(draft);
    expect(size).toBeGreaterThan(0);
    expect(size).toBe(new Blob([JSON.stringify(draft)]).size);
  });
});
