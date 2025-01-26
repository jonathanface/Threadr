// Vitest unit tests for ThreadWriter component
import React, { act } from 'react';
import { render, screen, fireEvent, cleanup, waitFor, createEvent } from '@testing-library/react';
import { ThreadWriter } from './index';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom/vitest'
import { AppNavigationProvider } from '../../contexts/navigation';


expect.extend(matchers);

beforeAll(() => {
    // Stub out global fetch so it doesn't try the real network
    global.fetch = vi.fn(async (url: RequestInfo) => {
        // If desired, you can check `url` and return mock data
        return {
            ok: true,
            json: async () => ({ items: [] }),
        };
    }) as unknown as typeof fetch;
});

// threadwriter.test.tsx
vi.mock('@lexical/react/LexicalComposer', () => {
    const React = require('react');
    const LexicalComposerContext = React.createContext([
        {
            registerNodeTransform: vi.fn(),
            registerCommand: vi.fn(),
            getEditorState: vi.fn(() => ({
                read: vi.fn((fn: () => void) => fn()),
            })),
            update: vi.fn((fn: () => void) => fn()),
            focus: vi.fn(),
        },
        vi.fn(),
    ]);

    return {
        // Mock LexicalComposer itself
        LexicalComposer: vi.fn(({ children }: { children: React.ReactNode }) => (
            <LexicalComposerContext.Provider
                value={[
                    {
                        registerNodeTransform: vi.fn(),
                        registerCommand: vi.fn(),
                        getEditorState: vi.fn(() => ({
                            read: vi.fn((fn: () => void) => fn()),
                        })),
                        update: vi.fn((fn: () => void) => fn()),
                        focus: vi.fn(),
                    },
                    vi.fn(),
                ]}
            >
                <div data-testid="LexicalComposer">{children}</div>
            </LexicalComposerContext.Provider>
        )),
        // Mock the hook
        useLexicalComposerContext: () => React.useContext(LexicalComposerContext),
    };
});

// Each plugin used by ThreadWriter must be mocked, too:
vi.mock('@lexical/react/LexicalRichTextPlugin', () => ({
    RichTextPlugin: vi.fn(({ contentEditable, placeholder, ErrorBoundary }) => {
        // In real usage, RichTextPlugin also calls useLexicalComposerContext
        return (
            <div data-testid="RichTextPlugin">
                {contentEditable}
                {placeholder}
            </div>
        );
    }),
}));

vi.mock('@lexical/react/LexicalOnChangePlugin', () => ({
    OnChangePlugin: vi.fn(({ onChange }) => {
        // Also calls useLexicalComposerContext internally
        return <div data-testid="OnChangePlugin" />;
    }),
}));

vi.mock('@lexical/react/LexicalContentEditable', () => ({
    ContentEditable: vi.fn(({ className }) => (
        <div data-testid="MockedContentEditable" className={className}>
            {/* mock ContentEditable */}
        </div>
    )),
}));

vi.mock('@lexical/react/LexicalHistoryPlugin', () => ({
    HistoryPlugin: vi.fn(() => <div data-testid="HistoryPlugin" />),
}));

vi.mock('../ThreadWriterToolbar', () => ({
    Toolbar: vi.fn(() => <div data-testid="mocked-toolbar" />),
}));

vi.mock('@lexical/react/LexicalErrorBoundary', () => {
    return {
        __esModule: true,
        default: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="MockedLexicalErrorBoundary">{children}</div>
        ),
    };
});

vi.mock('./plugins/AssociationDecoratorPlugin', () => ({
    AssociationDecoratorPlugin: vi.fn(() => (
        <div data-testid="AssociationDecoratorPlugin" />
    )),
}));

vi.mock('../../hooks/useCurrentSelections', () => ({
    useCurrentSelections: vi.fn(() => ({
        currentStory: { story_id: 'mock-story' },
        currentChapter: { id: 'mock-chapter' },
    })),
}));



vi.mock('uuid', () => ({
    v4: vi.fn(() => 'mock-uuid'),
}));

vi.mock('../../hooks/useToaster', () => ({
    useToaster: vi.fn(() => ({ setAlertState: vi.fn() })),
}));

vi.mock('../../hooks/useLoader', () => ({
    useLoader: vi.fn(() => ({ setIsLoaderVisible: vi.fn() })),
}));
import { useLoader } from '../../hooks/useLoader';

vi.mock('./queue', () => ({
    DbOperationQueue: {
        push: vi.fn(),
    },
    ProcessDBQueue: vi.fn(),
}));

vi.mock('../AssociationPanel', () => ({
    AssociationPanel: () => <div data-testid="mocked-association-panel" />,
}));

// Mock styles module
vi.mock('./threadwriter.module.css', () => ({
    default: {
        paragraph: 'mock-paragraph',
        bold: 'mock-bold',
        italic: 'mock-italic',
        underline: 'mock-underline',
        strikethrough: 'mock-strikethrough',
        editorContainer: 'mock-editor-container',
        editorInput: 'mock-editor-input',
        placeholder: 'mock-placeholder',
    },
}));


describe('ThreadWriter Component', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => {
        cleanup();
    });

    it('renders the component', () => {
        render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

        expect(screen.getByText('Start typing...')).toBeInTheDocument();
    });

    it('initializes the LexicalComposer with the correct config', () => {
        render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

        const composers = screen.getAllByTestId('LexicalComposer');

        // Ensure at least one is rendered:
        expect(composers.length).toBeGreaterThan(0);
    });

    it('calls setIsLoaderVisible when retrieving data', async () => {
        const { setIsLoaderVisible } = useLoader();
        render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

        await waitFor(() => {
            expect(setIsLoaderVisible).toHaveBeenCalledWith(true);
        });
        await waitFor(() => {
            expect(setIsLoaderVisible).toHaveBeenCalledWith(false);
        });
    });

    it.only('handles paste events correctly', () => {

        act(() => {
            render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

            const editor = screen.getByTestId('MockedContentEditable');
            const clipboardData = {
                getData: vi.fn(() => 'Some text\nAnother line'),
            };

            // Create a real paste event recognized by Testing Library
            const pasteEvent = createEvent.paste(editor, {
                clipboardData: clipboardData as unknown as DataTransfer,
            });

            fireEvent.paste(editor, pasteEvent);
            console.log("ed", editor, editor.parentElement);

            // Now the Lexical paste handler will be triggered,
            // calling clipboardData.getData('text/plain')
            expect(clipboardData.getData).toHaveBeenCalledWith('text/plain');

        });
    });

    it('queues paragraph for save when onChangeHandler detects changes', () => {
        render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

        const editorStateMock = {
            read: vi.fn((callback) => callback()),
        };

        const instance = require('@lexical/react/LexicalComposer').LexicalComposer.mock.calls[0][0].initialConfig.editorState;
        instance(editorStateMock);

        expect(require('./queue').DbOperationQueue.push).toHaveBeenCalled();
    });

    it('shows an error toast when ProcessDBQueue fails', () => {
        const { setAlertState } = require('../../hooks/useToaster').useToaster();
        const ProcessDBQueue = require('./queue').ProcessDBQueue;

        ProcessDBQueue.mockImplementationOnce(() => {
            throw new Error('Queue processing error');
        });

        vi.useFakeTimers();

        render(<AppNavigationProvider><ThreadWriter /></AppNavigationProvider>);

        vi.advanceTimersByTime(5000);

        expect(setAlertState).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Unable to sync',
            })
        );
    });
});