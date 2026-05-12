import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { UserContext, type UserContextType } from "../../../contexts/user";
import type { DemoDraft } from "../types";

const mockNavigate = vi.fn();
const mockCapture = vi.fn();
const mockReadDraft = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@posthog/react", () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock("../storage", () => ({
  DEMO_PENDING_CONVERSION_KEY: "threadr_demo_pending_conversion",
  readDraft: (...args: unknown[]) => mockReadDraft(...args),
}));

// Stub TryWriter so the test can trigger each parent callback in isolation.
// The stub renders the title it receives plus four buttons.
vi.mock("../TryWriter", () => ({
  TryWriter: ({
    title,
    onTitleChange,
    onWarning,
    onSaveClick,
    onBackClick,
    reportSnapshot,
  }: {
    title: string;
    onTitleChange: (next: string) => void;
    onWarning: (message: string) => void;
    onSaveClick: () => void;
    onBackClick: () => void;
    reportSnapshot: (snap: DemoDraft) => void;
  }) => (
    <div data-testid="try-writer">
      <span data-testid="try-writer-title">{title}</span>
      <button type="button" onClick={() => onTitleChange("Updated Title")}>
        rename
      </button>
      <button type="button" onClick={() => onWarning("Heads up!")}>
        warn
      </button>
      <button
        type="button"
        onClick={() =>
          reportSnapshot({
            version: 1,
            title: "Snapshot Title",
            lexical_state: JSON.stringify({
              root: {
                children: [
                  { children: [{ text: "Hello" }, { text: " world" }] },
                  { children: [{ text: "!" }] },
                ],
              },
            }),
            associations: [
              {
                client_id: "a1",
                name: "Mina",
                type: "character",
                short_description: "",
                extended_description: "",
              },
              {
                client_id: "a2",
                name: "Abbey",
                type: "place",
                short_description: "",
                extended_description: "",
              },
            ],
            updated_at: "2026-05-10T00:00:00.000Z",
          })
        }
      >
        snapshot
      </button>
      <button type="button" onClick={onSaveClick}>
        save
      </button>
      <button type="button" onClick={onBackClick}>
        back
      </button>
    </div>
  ),
}));

import { DemoPage } from "../index";

const renderDemoPage = (
  ctx: Partial<UserContextType> | null = null,
) => {
  const value: UserContextType | undefined = ctx
    ? {
        userDetails: null,
        isLoggedIn: false,
        userLoading: false,
        setIsLoggedIn: vi.fn(),
        setUserDetails: vi.fn(),
        clearWelcomeFlags: vi.fn(),
        ...ctx,
      }
    : undefined;

  return render(
    <UserContext.Provider value={value as UserContextType}>
      <DemoPage />
    </UserContext.Provider>,
  );
};

const sampleSnapshot = (overrides: Partial<DemoDraft> = {}): DemoDraft => ({
  version: 1,
  title: "Stored",
  lexical_state: JSON.stringify({
    root: { children: [{ children: [{ text: "Existing draft" }] }] },
  }),
  associations: [],
  updated_at: "2026-05-09T00:00:00.000Z",
  ...overrides,
});

describe("DemoPage (/try)", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockCapture.mockReset();
    mockReadDraft.mockReset();
    mockReadDraft.mockReturnValue(null);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("rendering", () => {
    it("renders the trial banner heading", () => {
      renderDemoPage();
      expect(screen.getByRole("heading", { name: /try threadr/i })).toBeInTheDocument();
    });

    it("hydrates the title from a stored draft", () => {
      mockReadDraft.mockReturnValue(sampleSnapshot({ title: "My Novel" }));
      renderDemoPage();
      expect(screen.getByTestId("try-writer-title")).toHaveTextContent("My Novel");
    });

    it("falls back to an empty title when no draft is stored", () => {
      renderDemoPage();
      expect(screen.getByTestId("try-writer-title")).toHaveTextContent("");
    });

    it("propagates title changes from TryWriter back into state", async () => {
      const user = userEvent.setup();
      renderDemoPage();

      await user.click(screen.getByRole("button", { name: "rename" }));
      expect(screen.getByTestId("try-writer-title")).toHaveTextContent("Updated Title");
    });
  });

  describe("analytics", () => {
    it("fires demo_started exactly once on first mount", () => {
      renderDemoPage();
      expect(mockCapture).toHaveBeenCalledWith("demo_started");
      expect(
        mockCapture.mock.calls.filter((c) => c[0] === "demo_started").length,
      ).toBe(1);
    });

    it("does not re-fire demo_started when the session flag is already set", () => {
      sessionStorage.setItem("demo_started_fired", "true");
      renderDemoPage();
      expect(
        mockCapture.mock.calls.filter((c) => c[0] === "demo_started").length,
      ).toBe(0);
    });
  });

  describe("warning Snackbar", () => {
    it("surfaces a warning message when TryWriter calls onWarning", async () => {
      const user = userEvent.setup();
      renderDemoPage();

      expect(screen.queryByText("Heads up!")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "warn" }));
      await waitFor(() => {
        expect(screen.getByText("Heads up!")).toBeInTheDocument();
      });
    });
  });

  describe("save flow", () => {
    it("navigates anonymous users to /signup?from=demo", async () => {
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: false });

      await user.click(screen.getByRole("button", { name: "save" }));
      expect(mockNavigate).toHaveBeenCalledWith("/signup?from=demo");
    });

    it("navigates logged-in users to /import-draft", async () => {
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: true });

      await user.click(screen.getByRole("button", { name: "save" }));
      expect(mockNavigate).toHaveBeenCalledWith("/import-draft");
    });

    it("sets the pending-conversion flag before navigating", async () => {
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: false });

      await user.click(screen.getByRole("button", { name: "save" }));
      expect(localStorage.getItem("threadr_demo_pending_conversion")).toBe("true");
    });

    it("captures demo_save_clicked with snapshot-derived metrics", async () => {
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: false });

      // Push a snapshot through TryWriter first so latestSnapshotRef is set.
      await user.click(screen.getByRole("button", { name: "snapshot" }));
      await user.click(screen.getByRole("button", { name: "save" }));

      const saveCall = mockCapture.mock.calls.find(
        (c) => c[0] === "demo_save_clicked",
      );
      expect(saveCall).toBeDefined();
      const payload = saveCall?.[1] as Record<string, unknown>;
      expect(payload.has_associations).toBe(true);
      expect(payload.associations_count).toBe(2);
      // "Hello"(5) + " world"(6) + "!"(1) = 12 characters.
      expect(payload.character_count).toBe(12);
      expect(payload.title_set).toBe(true);
    });

    it("falls back to readDraft when no snapshot has been reported yet", async () => {
      mockReadDraft.mockReturnValue(sampleSnapshot({ title: "Fallback" }));
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: false });

      // No snapshot button pressed — latestSnapshotRef was seeded from readDraft
      // during the initial render and handleSave should use it.
      await user.click(screen.getByRole("button", { name: "save" }));

      const saveCall = mockCapture.mock.calls.find(
        (c) => c[0] === "demo_save_clicked",
      );
      expect(saveCall).toBeDefined();
      expect((saveCall?.[1] as Record<string, unknown>).title_set).toBe(true);
    });

    it("reports zero/false metrics when there is no snapshot at all", async () => {
      // readDraft returns null both on first paint and inside handleSave's
      // fallback, so the metrics path uses the safe defaults.
      mockReadDraft.mockReturnValue(null);
      const user = userEvent.setup();
      renderDemoPage({ isLoggedIn: false });

      await user.click(screen.getByRole("button", { name: "save" }));

      const saveCall = mockCapture.mock.calls.find(
        (c) => c[0] === "demo_save_clicked",
      );
      const payload = saveCall?.[1] as Record<string, unknown>;
      expect(payload.has_associations).toBe(false);
      expect(payload.associations_count).toBe(0);
      expect(payload.character_count).toBe(0);
      expect(payload.title_set).toBe(false);
    });
  });

  describe("back navigation", () => {
    it("navigates to / when TryWriter requests a back action", async () => {
      const user = userEvent.setup();
      renderDemoPage();

      await user.click(screen.getByRole("button", { name: "back" }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
