import "@testing-library/jest-dom";
import { act, render, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../../api";
import { useDrafts } from "../../hooks/useDrafts";
import type { Story } from "../../types/Story";
import { DraftsProvider } from "../drafts";

vi.mock("../../api", () => ({
  api: {
    get: vi.fn(),
  },
}));

const makeStory = (overrides: Partial<Story> = {}): Story => ({
  story_id: "root-1",
  title: "T",
  description: "",
  chapters: [],
  image_url: "",
  ...overrides,
});

// Mini consumer that exposes the context's state so tests can read it.
const Probe = ({
  onReady,
}: {
  onReady: (ctx: ReturnType<typeof useDrafts>) => void;
}) => {
  const ctx = useDrafts();
  useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return null;
};

describe("DraftsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches drafts for a story id and populates the cache", async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: [makeStory({ story_id: "root-1" })],
    });
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await waitFor(() => {
      expect(latest!.storyID).toBe("root-1");
      expect(latest!.list?.length).toBe(1);
    });
    expect(apiModule.api.get).toHaveBeenCalledWith("/stories/root-1/drafts");
  });

  it("coalesces repeat fetches for the same story id", async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: [makeStory({ story_id: "root-1" })],
    });
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await waitFor(() => expect(latest!.list).not.toBeNull());
    // Calling fetch again while we already hold data for this id must
    // not fire another request.
    const callsBefore = vi.mocked(apiModule.api.get).mock.calls.length;
    await act(async () => {
      latest!.fetch("root-1");
    });
    expect(vi.mocked(apiModule.api.get).mock.calls.length).toBe(callsBefore);
  });

  it("refresh() re-fetches the current id", async () => {
    vi.mocked(apiModule.api.get)
      .mockResolvedValueOnce({ data: [makeStory({ story_id: "root-1" })] })
      .mockResolvedValueOnce({
        data: [
          makeStory({ story_id: "root-1" }),
          makeStory({ story_id: "draft-2", original_story_id: "root-1" }),
        ],
      });
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await waitFor(() => expect(latest!.list?.length).toBe(1));
    await act(async () => {
      latest!.refresh();
    });
    await waitFor(() => expect(latest!.list?.length).toBe(2));
  });

  it("clear() drops the cache", async () => {
    vi.mocked(apiModule.api.get).mockResolvedValue({
      data: [makeStory({ story_id: "root-1" })],
    });
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await waitFor(() => expect(latest!.list).not.toBeNull());
    await act(async () => {
      latest!.clear();
    });
    await waitFor(() => {
      expect(latest!.list).toBeNull();
      expect(latest!.storyID).toBeNull();
    });
  });

  it("records the HTTP status in errorStatus on fetch failure", async () => {
    // Axios 402 — the "subscribers only" signal the DraftsDialog uses
    // to show a friendlier message than the generic error.
    const err = new AxiosError("payment required");
    err.response = {
      status: 402,
      statusText: "Payment Required",
      data: null,
      headers: {},
      config: { headers: {} },
    } as AxiosError["response"];
    vi.mocked(apiModule.api.get).mockRejectedValue(err);
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await waitFor(() => {
      expect(latest!.errorStatus).toBe(402);
      expect(latest!.list).toEqual([]);
    });
  });

  it("ignores a late response from a stale fetch when the id has moved on", async () => {
    // First fetch is slow; a second fetch starts before the first resolves.
    // Only the second's result should land in state.
    let resolveFirst: (v: { data: Story[] }) => void;
    const firstPromise = new Promise<{ data: Story[] }>((r) => {
      resolveFirst = r;
    });
    vi.mocked(apiModule.api.get)
      .mockReturnValueOnce(
        firstPromise as unknown as ReturnType<typeof apiModule.api.get>,
      )
      .mockResolvedValueOnce({
        data: [makeStory({ story_id: "root-2" })],
      });
    let latest: ReturnType<typeof useDrafts> | null = null;
    render(
      <DraftsProvider>
        <Probe onReady={(c) => (latest = c)} />
      </DraftsProvider>,
    );
    await act(async () => {
      latest!.fetch("root-1");
    });
    await act(async () => {
      latest!.fetch("root-2");
    });
    await waitFor(() => expect(latest!.storyID).toBe("root-2"));
    // Now resolve the stale first-fetch; the provider must ignore it.
    await act(async () => {
      resolveFirst!({ data: [makeStory({ story_id: "root-1" })] });
    });
    // State should still reflect root-2, not root-1.
    expect(latest!.storyID).toBe("root-2");
    expect(latest!.list?.[0].story_id).toBe("root-2");
  });
});
