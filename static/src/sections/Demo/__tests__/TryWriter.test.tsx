import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import type { DemoDraft } from "../types";

const mockReadDraft = vi.fn();
const mockWriteDraft = vi.fn();

vi.mock("../storage", () => ({
  DEMO_SIZE_LIMIT_BYTES: 1_000_000,
  readDraft: (...args: unknown[]) => mockReadDraft(...args),
  writeDraft: (...args: unknown[]) => mockWriteDraft(...args),
}));

const fakeEditorState = {
  root: { children: [], type: "root", version: 1 },
};
const fakeEditor = {
  getEditorState: () => ({ toJSON: () => fakeEditorState }),
  update: vi.fn(),
  focus: vi.fn(),
  getRootElement: () => null,
  getElementByKey: () => null,
};

vi.mock("@lexical/react/LexicalComposer", () => ({
  LexicalComposer: ({
    initialConfig,
    children,
  }: {
    initialConfig: { editorState?: (editor: unknown) => void };
    children: ReactNode;
  }) => {
    if (typeof initialConfig.editorState === "function") {
      initialConfig.editorState(fakeEditor);
    }
    return <div data-testid="lexical-composer">{children}</div>;
  },
}));

vi.mock("@lexical/react/LexicalRichTextPlugin", () => ({
  RichTextPlugin: ({ contentEditable }: { contentEditable: ReactNode }) => (
    <div data-testid="rich-text-plugin">{contentEditable}</div>
  ),
}));

vi.mock("@lexical/react/LexicalContentEditable", () => ({
  ContentEditable: ({ className }: { className?: string }) => (
    <div data-testid="content-editable" className={className} />
  ),
}));

vi.mock("@lexical/react/LexicalHistoryPlugin", () => ({
  HistoryPlugin: () => null,
}));

vi.mock("@lexical/react/LexicalOnChangePlugin", () => ({
  OnChangePlugin: () => null,
}));

vi.mock("@lexical/react/LexicalErrorBoundary", () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("../../../components/ThreadWriter/hooks/useAutotabOnEnter", () => ({
  useAutotabOnEnter: vi.fn(),
}));

vi.mock("../../../components/ThreadWriter/hooks/useEditorStateUpdater", () => ({
  useEditorStateUpdater: vi.fn(),
}));

vi.mock(
  "../../../components/demoComponents/hooks/useEditorCommandsDemo",
  () => ({
    useEditorCommandsDemo: vi.fn(),
  }),
);

vi.mock(
  "../../../components/ThreadWriter/plugins/AssociationDecoratorPlugin",
  () => ({
    AssociationDecoratorPlugin: () => null,
  }),
);

vi.mock(
  "../../../components/ThreadWriter/plugins/DocumentClickPlugin",
  () => ({
    default: () => null,
  }),
);

vi.mock(
  "../../../components/ThreadWriter/plugins/TextTransformPlugin",
  () => ({
    TextTransformPlugin: () => null,
  }),
);

vi.mock("../../../components/ThreadWriter/subcomponents/ContextMenu", () => ({
  ContextMenu: () => null,
}));

vi.mock("../../../components/demoComponents/AssociationPanelDemo", () => ({
  AssociationPanelDemo: () => null,
}));

vi.mock("../../../components/demoComponents/ThreadWriterToolbarDemo", () => ({
  ToolbarDemo: () => <div data-testid="toolbar-demo" />,
}));

import { TryWriter, MAX_DEMO_ASSOCIATIONS, DEMO_BYTES_LIMIT } from "../TryWriter";
import { DEMO_SIZE_LIMIT_BYTES } from "../storage";

const validDraft = (overrides: Partial<DemoDraft> = {}): DemoDraft => ({
  version: 1,
  title: "Hello",
  lexical_state: JSON.stringify({
    root: { children: [], type: "root", version: 1 },
  }),
  associations: [],
  updated_at: "2026-05-10T00:00:00.000Z",
  ...overrides,
});

interface RenderOptions {
  title?: string;
  onTitleChange?: () => void;
  onWarning?: () => void;
  onSaveClick?: () => void;
  onBackClick?: () => void;
  reportSnapshot?: (snap: DemoDraft) => void;
}

const renderTryWriter = (opts: RenderOptions = {}) => {
  const props = {
    title: opts.title ?? "",
    onTitleChange: opts.onTitleChange ?? vi.fn(),
    onWarning: opts.onWarning ?? vi.fn(),
    onSaveClick: opts.onSaveClick ?? vi.fn(),
    onBackClick: opts.onBackClick ?? vi.fn(),
    reportSnapshot: opts.reportSnapshot ?? vi.fn(),
  };
  const utils = render(<TryWriter {...props} />);
  return { ...utils, props };
};

describe("TryWriter", () => {
  beforeEach(() => {
    mockReadDraft.mockReset();
    mockWriteDraft.mockReset();
    mockWriteDraft.mockReturnValue({ ok: true });
    mockReadDraft.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("hydration", () => {
    it("renders without crashing when localStorage is empty", () => {
      renderTryWriter();
      expect(screen.getByTestId("lexical-composer")).toBeInTheDocument();
      expect(screen.getByLabelText("Story title")).toBeInTheDocument();
    });

    it("renders without crashing when the stored lexical_state is corrupt JSON", () => {
      mockReadDraft.mockReturnValue(validDraft({ lexical_state: "{not valid" }));
      expect(() => renderTryWriter()).not.toThrow();
      expect(screen.getByTestId("lexical-composer")).toBeInTheDocument();
    });
  });

  describe("title input", () => {
    it("has the expected accessibility attributes", () => {
      renderTryWriter({ title: "Foo" });
      const input = screen.getByLabelText("Story title") as HTMLInputElement;
      expect(input).toHaveAttribute("maxLength", "200");
      expect(input.value).toBe("Foo");
    });

    it("invokes onTitleChange with each typed value", async () => {
      const user = userEvent.setup();
      const onTitleChange = vi.fn();
      renderTryWriter({ onTitleChange });

      const input = screen.getByLabelText("Story title");
      await user.type(input, "Hi");

      expect(onTitleChange).toHaveBeenCalledWith("H");
      expect(onTitleChange).toHaveBeenCalledWith("i");
    });
  });

  describe("persistence", () => {
    it("persists and reports a snapshot when the title prop changes", () => {
      const reportSnapshot = vi.fn();
      const { rerender, props } = renderTryWriter({
        title: "A",
        reportSnapshot,
      });

      mockWriteDraft.mockClear();
      reportSnapshot.mockClear();

      rerender(<TryWriter {...props} title="B" />);

      // Two persist useEffects both depend on persistDraft (which depends on
      // title), so a title change fires both and yields >=1 writeDraft call.
      // We assert on payload content rather than locking call count.
      expect(mockWriteDraft).toHaveBeenCalled();
      const lastCall =
        mockWriteDraft.mock.calls[mockWriteDraft.mock.calls.length - 1];
      const written = (lastCall?.[0] ?? {}) as DemoDraft;
      expect(written.title).toBe("B");
      expect(written.version).toBe(1);

      expect(reportSnapshot).toHaveBeenCalled();
      const lastSnap =
        reportSnapshot.mock.calls[reportSnapshot.mock.calls.length - 1];
      expect((lastSnap?.[0] as DemoDraft).title).toBe("B");
    });

    it("warns once when writeDraft hits the size limit and stays quiet on subsequent failures", () => {
      mockWriteDraft.mockReturnValue({ ok: false, reason: "size_limit" });
      const onWarning = vi.fn();
      const { rerender, props } = renderTryWriter({ title: "A", onWarning });

      rerender(<TryWriter {...props} title="B" />);
      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning.mock.calls[0]?.[0]).toMatch(/size limit/i);

      rerender(<TryWriter {...props} title="C" />);
      expect(onWarning).toHaveBeenCalledTimes(1); // still 1 — not re-warned
    });

    it("re-arms the size-limit warning after a successful write", () => {
      mockWriteDraft.mockReturnValue({ ok: false, reason: "size_limit" });
      const onWarning = vi.fn();
      const { rerender, props } = renderTryWriter({ title: "A", onWarning });

      rerender(<TryWriter {...props} title="B" />);
      expect(onWarning).toHaveBeenCalledTimes(1);

      mockWriteDraft.mockReturnValue({ ok: true });
      rerender(<TryWriter {...props} title="C" />);
      expect(onWarning).toHaveBeenCalledTimes(1);

      mockWriteDraft.mockReturnValue({ ok: false, reason: "size_limit" });
      rerender(<TryWriter {...props} title="D" />);
      expect(onWarning).toHaveBeenCalledTimes(2);
    });
  });

  describe("action buttons", () => {
    it("invokes onBackClick when the Back button is clicked", async () => {
      const user = userEvent.setup();
      const onBackClick = vi.fn();
      renderTryWriter({ onBackClick });

      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(onBackClick).toHaveBeenCalledTimes(1);
    });

    it("invokes onSaveClick when the Save button is clicked", async () => {
      const user = userEvent.setup();
      const onSaveClick = vi.fn();
      renderTryWriter({ onSaveClick });

      await user.click(screen.getByRole("button", { name: /save my draft/i }));
      expect(onSaveClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("exported constants", () => {
    it("caps demo associations at the non-subscriber limit", () => {
      // Mirror of api/consts.go nonSubscriberMaxAssoc. Bump here only when
      // the backend cap intentionally changes.
      expect(MAX_DEMO_ASSOCIATIONS).toBe(10);
    });

    it("re-exports the storage byte limit", () => {
      expect(DEMO_BYTES_LIMIT).toBe(DEMO_SIZE_LIMIT_BYTES);
    });
  });
});
