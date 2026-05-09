import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockCapture = vi.fn();
const mockSetStoriesList = vi.fn();
let mockStoriesList: unknown[] | null = [];

vi.mock("../../../api", () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
  },
}));

vi.mock("@posthog/react", () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock("../../../hooks/useWorksList", () => ({
  useWorksList: () => ({
    storiesList: mockStoriesList,
    setStoriesList: mockSetStoriesList,
    seriesList: null,
    setSeriesList: vi.fn(),
  }),
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  mockApiPost.mockReset();
  mockApiPut.mockReset();
  mockCapture.mockReset();
  mockSetStoriesList.mockReset();
  mockStoriesList = [];
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const seedDraft = () => {
  const draft = {
    version: 1,
    title: "Working title",
    lexical_state: JSON.stringify({
      root: {
        type: "root",
        version: 1,
        direction: "ltr",
        format: "",
        indent: 0,
        children: [
          {
            type: "custom-paragraph",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            key_id: "para-key-1",
            children: [{ type: "text", version: 1, text: "Hello world." }],
          },
          {
            type: "custom-paragraph",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            key_id: "para-key-2",
            children: [{ type: "text", version: 1, text: "Second paragraph." }],
          },
        ],
      },
    }),
    associations: [
      {
        client_id: "assoc-1",
        name: "Mina",
        type: "character" as const,
        short_description: "Friend",
        extended_description: "",
      },
    ],
    updated_at: new Date("2026-05-08T12:00:00Z").toISOString(),
  };
  localStorage.setItem("threadr_demo_draft", JSON.stringify(draft));
  localStorage.setItem("threadr_demo_pending_conversion", "true");
};

describe("useDemoConversion", () => {
  it("creates story, posts associations, writes blocks, clears storage, and fires conversion event", async () => {
    seedDraft();
    mockApiPost.mockImplementation(async (url: string) => {
      if (url === "/stories") {
        return {
          data: {
            story_id: "new-story-id",
            title: "Final Title",
            chapters: [{ id: "chapter-id-1", place: 1 }],
          },
        };
      }
      return { data: [] };
    });
    mockApiPut.mockResolvedValue({ data: {} });

    const { useDemoConversion } = await import("../hooks/useDemoConversion");
    const { result } = renderHook(() => useDemoConversion());

    let outcome:
      | { story: { story_id: string }; block_count: number; association_count: number }
      | undefined;
    await act(async () => {
      outcome = await result.current.convert("Final Title");
    });

    expect(outcome?.story.story_id).toBe("new-story-id");
    expect(outcome?.block_count).toBe(2);
    expect(outcome?.association_count).toBe(1);

    const postCalls = mockApiPost.mock.calls;
    expect(postCalls[0][0]).toBe("/stories");
    expect(postCalls[1][0]).toBe("/stories/new-story-id/associations");
    expect(postCalls[1][1]).toEqual([
      expect.objectContaining({
        association_id: "assoc-1",
        association_name: "Mina",
        association_type: "character",
      }),
    ]);

    const putCalls = mockApiPut.mock.calls;
    expect(putCalls[0][0]).toBe("/stories/new-story-id");
    expect(putCalls[0][1]).toMatchObject({
      story_id: "new-story-id",
      chapter_id: "chapter-id-1",
    });
    expect(putCalls[0][1].blocks).toHaveLength(2);
    expect(putCalls[0][1].blocks[0]).toMatchObject({
      key_id: "para-key-1",
      place: "0",
    });

    expect(localStorage.getItem("threadr_demo_draft")).toBeNull();
    expect(localStorage.getItem("threadr_demo_pending_conversion")).toBeNull();

    expect(mockCapture).toHaveBeenCalledWith("demo_converted_to_signup", {
      story_id: "new-story-id",
      block_count: 2,
      association_count: 1,
    });

    expect(mockSetStoriesList).toHaveBeenCalledTimes(1);
    const updated = mockSetStoriesList.mock.calls[0][0] as { story_id: string }[];
    expect(updated).toHaveLength(1);
    expect(updated[0].story_id).toBe("new-story-id");
  });

  it("rejects an empty title without making API calls", async () => {
    seedDraft();
    const { useDemoConversion } = await import("../hooks/useDemoConversion");
    const { result } = renderHook(() => useDemoConversion());

    await expect(result.current.convert("   ")).rejects.toThrow("Title is required");
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("throws when there is no draft in storage", async () => {
    const { useDemoConversion } = await import("../hooks/useDemoConversion");
    const { result } = renderHook(() => useDemoConversion());

    await expect(result.current.convert("Anything")).rejects.toThrow(
      "No demo draft found",
    );
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
