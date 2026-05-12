import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { AlertToastType } from "../../../types/AlertToasts";
import type { DemoDraft } from "../types";

const mockNavigate = vi.fn();
const mockSetAlertState = vi.fn();
const mockConvert = vi.fn();
const mockReadDraft = vi.fn();
const mockClearDraft = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../../hooks/useToaster", () => ({
  useToaster: () => ({ setAlertState: mockSetAlertState }),
}));

vi.mock("../hooks/useDemoConversion", () => ({
  useDemoConversion: () => ({ convert: mockConvert }),
}));

vi.mock("../storage", () => ({
  DEMO_PENDING_CONVERSION_KEY: "threadr_demo_pending_conversion",
  readDraft: (...args: unknown[]) => mockReadDraft(...args),
  clearDraft: (...args: unknown[]) => mockClearDraft(...args),
}));

import { ImportDraftPage } from "../ImportDraftPage";

const sampleDraft = (overrides: Partial<DemoDraft> = {}): DemoDraft => ({
  version: 1,
  title: "My Trial Draft",
  lexical_state: JSON.stringify({
    root: { children: [{ children: [{ text: "Hello" }] }] },
  }),
  associations: [],
  updated_at: "2026-05-10T00:00:00.000Z",
  ...overrides,
});

const successResult = (overrides: {
  block_count?: number;
  association_count?: number;
  story_id?: string;
} = {}) => ({
  block_count: overrides.block_count ?? 4,
  association_count: overrides.association_count ?? 0,
  story: { story_id: overrides.story_id ?? "story-abc" },
});

describe("ImportDraftPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetAlertState.mockReset();
    mockConvert.mockReset();
    mockReadDraft.mockReset();
    mockClearDraft.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("when there is no draft to import", () => {
    it("clears the pending-conversion flag and redirects to /stories", () => {
      localStorage.setItem("threadr_demo_pending_conversion", "true");
      mockReadDraft.mockReturnValue(null);

      render(<ImportDraftPage />);

      expect(localStorage.getItem("threadr_demo_pending_conversion")).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith("/stories", { replace: true });
      expect(mockConvert).not.toHaveBeenCalled();
    });
  });

  describe("auto-conversion on mount", () => {
    it("shows the importing spinner while the conversion is in flight", () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      // Pending promise — never resolves during this assertion window.
      mockConvert.mockReturnValue(new Promise(() => {}));

      render(<ImportDraftPage />);

      expect(screen.getByText(/importing your draft/i)).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("uses the stored draft title (trimmed) for the auto-conversion", async () => {
      mockReadDraft.mockReturnValue(sampleDraft({ title: "  My Story  " }));
      mockConvert.mockResolvedValue(successResult());

      render(<ImportDraftPage />);

      await waitFor(() => {
        expect(mockConvert).toHaveBeenCalledWith("My Story");
      });
    });

    it("falls back to 'Untitled story' when the saved title is blank", async () => {
      mockReadDraft.mockReturnValue(sampleDraft({ title: "   " }));
      mockConvert.mockResolvedValue(successResult());

      render(<ImportDraftPage />);

      await waitFor(() => {
        expect(mockConvert).toHaveBeenCalledWith("Untitled story");
      });
    });

    it("only runs the auto-conversion once even across re-renders", async () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockResolvedValue(successResult());

      const { rerender } = render(<ImportDraftPage />);
      rerender(<ImportDraftPage />);
      rerender(<ImportDraftPage />);

      await waitFor(() => {
        expect(mockConvert).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("after a successful conversion", () => {
    it("shows a success toast and navigates to the new story (replace)", async () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockResolvedValue(
        successResult({ block_count: 12, association_count: 0, story_id: "s1" }),
      );

      render(<ImportDraftPage />);

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalled();
      });
      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Your draft is now a story",
          message: "Imported 12 blocks.",
          severity: AlertToastType.success,
          open: true,
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/stories/s1", { replace: true });
    });

    it("mentions the association count in the toast when associations were imported", async () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockResolvedValue(
        successResult({ block_count: 5, association_count: 3, story_id: "s2" }),
      );

      render(<ImportDraftPage />);

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Imported 5 blocks and 3 story elements.",
          }),
        );
      });
    });
  });

  describe("when the conversion fails", () => {
    it("renders the form into view with the error alert", async () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockRejectedValueOnce(new Error("server is unhappy"));

      render(<ImportDraftPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/couldn't import your draft/i),
        ).toBeInTheDocument();
      });
      expect(screen.getByRole("button", { name: /import to my account/i })).toBeInTheDocument();
      expect(screen.queryByText(/importing your draft/i)).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("manual retry after an error", () => {
    const renderAfterError = async () => {
      mockReadDraft.mockReturnValue(sampleDraft({ title: "Saved Title" }));
      mockConvert.mockRejectedValueOnce(new Error("boom"));

      const utils = render(<ImportDraftPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /import to my account/i })).toBeInTheDocument();
      });
      // The next convert call is the retry — reset the spy so the test can
      // assert only on the retry's behaviour.
      mockConvert.mockReset();
      return utils;
    };

    it("rejects a whitespace-only title", async () => {
      // The input is `required`, so the browser blocks the submit when truly
      // empty. The JS-side trim-guard handles whitespace-only values, which
      // is the path this test exercises.
      const user = userEvent.setup();
      await renderAfterError();

      const input = screen.getByLabelText(/story title/i) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "   ");

      await user.click(screen.getByRole("button", { name: /import to my account/i }));

      await waitFor(() => {
        expect(screen.getByText(/please name your story/i)).toBeInTheDocument();
      });
      expect(mockConvert).not.toHaveBeenCalled();
    });

    it("rejects a title longer than 200 characters", async () => {
      const user = userEvent.setup();
      await renderAfterError();

      const input = screen.getByLabelText(/story title/i) as HTMLInputElement;
      // The component caps the input at 200 chars; bypass for the test so we
      // can exercise the JS-side length guard.
      input.setAttribute("maxLength", "999");
      await user.clear(input);
      await user.type(input, "x".repeat(201));

      await user.click(screen.getByRole("button", { name: /import to my account/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/title must be 200 characters or fewer/i),
        ).toBeInTheDocument();
      });
      expect(mockConvert).not.toHaveBeenCalled();
    });

    it("retries the conversion with a trimmed title", async () => {
      const user = userEvent.setup();
      await renderAfterError();
      // After the auto-conversion failure was caught and the form is showing,
      // queue a success for the manual retry.
      mockConvert.mockResolvedValueOnce(successResult({ story_id: "retry-1" }));

      const input = screen.getByLabelText(/story title/i) as HTMLInputElement;
      await user.clear(input);
      await user.type(input, "  New Title  ");

      await user.click(screen.getByRole("button", { name: /import to my account/i }));

      await waitFor(() => {
        expect(mockConvert).toHaveBeenCalledWith("New Title");
      });
    });
  });

  describe("discard flow", () => {
    it("does nothing when the user cancels the confirm dialog", async () => {
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockRejectedValueOnce(new Error("boom"));
      const confirmSpy = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(false);

      const user = userEvent.setup();
      render(<ImportDraftPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument();
      });
      mockNavigate.mockClear();

      await user.click(screen.getByRole("button", { name: /discard draft/i }));

      expect(confirmSpy).toHaveBeenCalled();
      expect(mockClearDraft).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("clears the draft and redirects when the user confirms", async () => {
      localStorage.setItem("threadr_demo_pending_conversion", "true");
      mockReadDraft.mockReturnValue(sampleDraft());
      mockConvert.mockRejectedValueOnce(new Error("boom"));
      vi.spyOn(window, "confirm").mockReturnValueOnce(true);

      const user = userEvent.setup();
      render(<ImportDraftPage />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /discard draft/i })).toBeInTheDocument();
      });
      mockNavigate.mockClear();

      await user.click(screen.getByRole("button", { name: /discard draft/i }));

      expect(mockClearDraft).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("threadr_demo_pending_conversion")).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith("/stories", { replace: true });
    });
  });
});
