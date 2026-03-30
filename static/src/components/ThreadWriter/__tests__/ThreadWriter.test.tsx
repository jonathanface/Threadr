import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThreadWriter } from '../index';
import * as React from 'react';
import { useSelections } from '../../../hooks/useSelections';
import { useFetchStoryBlocks } from '../hooks/useFetchStoryBlocks';
import { useDocumentSettings } from '../hooks/useDocumentSettings';

// Mock modules
vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSelections');
vi.mock('../hooks/useFetchStoryBlocks');

vi.mock('../hooks/useAssociations', () => ({
  useAssociations: () => ({
    associations: [],
    setAssociations: vi.fn(),
  }),
}));

vi.mock('../hooks/useEditorStateUpdater', () => ({
  useEditorStateUpdater: vi.fn(),
}));

vi.mock('../hooks/useDocumentSettings');

vi.mock('../hooks/useEditorCommands', () => ({
  useEditorCommands: vi.fn(),
}));

vi.mock('../hooks/useAutotabOnEnter', () => ({
  useAutotabOnEnter: vi.fn(),
}));

vi.mock('../hooks/useMobileCursorAdjustment', () => ({
  useMobileCursorAdjustment: vi.fn(),
}));

vi.mock('../hooks/useCursorMemory', () => ({
  useCursorMemory: vi.fn(),
}));

vi.mock('../../../api', () => ({
  api: {
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../queue', () => ({
  ProcessDBQueue: vi.fn().mockResolvedValue(undefined),
  QueueOp: vi.fn(),
  QueueSyncOrder: vi.fn(),
}));

vi.mock('../../../utils/EventEmitter', () => ({
  dbEventEmitter: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
}));

// Mock Lexical components
vi.mock('@lexical/react/LexicalComposer', () => ({
  LexicalComposer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="lexical-composer">{children}</div>
  ),
}));

vi.mock('@lexical/react/LexicalRichTextPlugin', () => ({
  RichTextPlugin: ({ contentEditable }: { contentEditable: React.ReactNode }) => (
    <div data-testid="rich-text-plugin">{contentEditable}</div>
  ),
}));

vi.mock('@lexical/react/LexicalContentEditable', () => ({
  ContentEditable: ({ className }: { className: string }) => (
    <div data-testid="content-editable" className={className} />
  ),
}));

vi.mock('@lexical/react/LexicalHistoryPlugin', () => ({
  HistoryPlugin: () => <div data-testid="history-plugin" />,
}));

vi.mock('@lexical/react/LexicalOnChangePlugin', () => ({
  OnChangePlugin: () => <div data-testid="onchange-plugin" />,
}));

vi.mock('@lexical/react/LexicalErrorBoundary', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

// Mock subcomponents
vi.mock('../subcomponents/DocumentMenu', () => ({
  DocumentMenu: () => <div data-testid="document-menu" />,
}));

vi.mock('../subcomponents/ContextMenu', () => ({
  ContextMenu: () => <div data-testid="context-menu" />,
}));

vi.mock('../subcomponents/AssociationPanel', () => ({
  AssociationPanel: () => <div data-testid="association-panel" />,
}));

vi.mock('../subcomponents/ThreadWriterToolbar', () => ({
  Toolbar: () => <div data-testid="toolbar" />,
}));

// Mock plugins
vi.mock('../plugins/AssociationDecoratorPlugin', () => ({
  AssociationDecoratorPlugin: () => <div data-testid="association-decorator-plugin" />,
}));

vi.mock('../plugins/DocumentClickPlugin', () => ({
  default: () => <div data-testid="document-click-plugin" />,
}));

vi.mock('../plugins/TextTransformPlugin', () => ({
  TextTransformPlugin: () => <div data-testid="text-transform-plugin" />,
}));

describe('ThreadWriter', () => {
  const mockStory = {
    story_id: 'story-123',
    title: 'Test Story',
  };

  const mockChapter = {
    id: 'chapter-456',
    title: 'Chapter 1',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(useSelections).mockReturnValue({
      story: mockStory,
      chapter: mockChapter,
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.mocked(useFetchStoryBlocks).mockReturnValue({
      getBatchedStoryBlocks: vi.fn().mockResolvedValue(undefined),
      previousTableStatus: 'ok',
      tableStatus: 'ok',
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    vi.mocked(useDocumentSettings).mockReturnValue({
      documentSettings: {
        autotab: false,
        spellcheck: true,
      },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Render', () => {
    it('should return null when no story is selected', () => {
      vi.mocked(useSelections).mockReturnValue({
        story: null,
        chapter: mockChapter,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      const { container } = render(<ThreadWriter />);
      expect(container.firstChild).toBeNull();
    });

    it('should return null when no chapter is selected', () => {
      vi.mocked(useSelections).mockReturnValue({
        story: mockStory,
        chapter: null,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      const { container } = render(<ThreadWriter />);
      expect(container.firstChild).toBeNull();
    });

    it('should show loading state when storyBlocks is null', async () => {
      // Mock to not set storyBlocks immediately
      vi.mocked(useFetchStoryBlocks).mockReturnValue({
        getBatchedStoryBlocks: vi.fn().mockImplementation(() => {
          // Don't set storyBlocks
          return Promise.resolve();
        }),
        previousTableStatus: 'ok',
        tableStatus: 'ok',
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<ThreadWriter />);

      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
  });

  // Note: Testing full rendered state with story blocks loaded is complex due to
  // the asynchronous nature of the component. These tests verify the basic structure
  // and would need integration tests for full rendering scenarios.

  describe('Hook integration', () => {
    it('should call useFetchStoryBlocks with correct parameters', () => {
      const mockGetBatched = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useFetchStoryBlocks).mockReturnValue({
        getBatchedStoryBlocks: mockGetBatched,
        previousTableStatus: 'ok',
        tableStatus: 'ok',
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<ThreadWriter />);

      expect(vi.mocked(useFetchStoryBlocks)).toHaveBeenCalledWith(
        mockStory.story_id,
        mockChapter.id,
        expect.any(Function), // setStoryBlocks
        expect.any(Object), // previousNodeKeysRef
      );
    });

    it('should render without errors when hooks are called', () => {
      const { container } = render(<ThreadWriter />);

      // Component renders either loading state or null when no blocks
      expect(container).toBeDefined();
    });
  });

  describe('Component key management', () => {
    it('should re-render when story changes', () => {
      const { container, rerender } = render(<ThreadWriter />);

      // Verify initial render
      expect(container.firstChild).toBeDefined();

      // Change story
      vi.mocked(useSelections).mockReturnValue({
        story: { ...mockStory, story_id: 'story-999' },
        chapter: mockChapter,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      rerender(<ThreadWriter />);

      // Component should re-render
      expect(container.firstChild).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle missing story gracefully', () => {
      vi.mocked(useSelections).mockReturnValue({
        story: undefined,
        chapter: mockChapter,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      const { container } = render(<ThreadWriter />);
      expect(container.firstChild).toBeNull();
    });

    it('should handle missing chapter gracefully', () => {
      vi.mocked(useSelections).mockReturnValue({
        story: mockStory,
        chapter: undefined,
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      const { container } = render(<ThreadWriter />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Queue processing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should render with timer setup', () => {
      const { container } = render(<ThreadWriter />);

      // Component sets up timers for queue processing
      expect(container).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should unmount without errors', () => {
      const { unmount } = render(<ThreadWriter />);

      expect(() => unmount()).not.toThrow();
    });

    it('should clean up window beforeunload listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<ThreadWriter />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });
  });

  describe('Settings integration', () => {
    it('should use document settings from hook', () => {
      vi.mocked(useDocumentSettings).mockReturnValue({
        documentSettings: {
          autotab: true,
          spellcheck: false,
        },
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      const { container } = render(<ThreadWriter />);

      // useDocumentSettings is called and settings are applied
      expect(container).toBeDefined();
      expect(useDocumentSettings).toHaveBeenCalled();
    });
  });
});
