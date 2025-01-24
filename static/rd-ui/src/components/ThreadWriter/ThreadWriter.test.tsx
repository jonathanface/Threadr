import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThreadWriter } from './index';
import { useLoader } from '../../hooks/useLoader';
import { useToaster } from '../../hooks/useToaster';
import { useCurrentSelections } from '../../hooks/useCurrentSelections';
import { PASTE_COMMAND } from 'lexical';

// Mock external hooks
jest.mock('../../hooks/useLoader', () => ({
    useLoader: jest.fn(),
}));

jest.mock('../../hooks/useToaster', () => ({
    useToaster: jest.fn(),
}));

jest.mock('../../hooks/useCurrentSelections', () => ({
    useCurrentSelections: jest.fn(),
}));

// Mock Lexical dependencies
jest.mock('@lexical/react/LexicalComposer', () => ({
    LexicalComposer: jest.fn(({ children }) => <div>{children}</div>),
}));

jest.mock('@lexical/react/LexicalContentEditable', () => ({
    ContentEditable: jest.fn(({ className }) => <div className={className} contentEditable></div>),
}));

jest.mock('@lexical/react/LexicalOnChangePlugin', () => ({
    OnChangePlugin: jest.fn(({ onChange }) => <div data-testid="onChangePlugin" onClick={() => onChange?.({})}>OnChangePlugin</div>),
}));

jest.mock('@lexical/react/LexicalRichTextPlugin', () => ({
    RichTextPlugin: jest.fn(() => <div>RichTextPlugin</div>),
}));

jest.mock('@lexical/react/LexicalHistoryPlugin', () => ({
    HistoryPlugin: jest.fn(() => <div>HistoryPlugin</div>),
}));

jest.mock('./customNodes/CustomParagraphNode', () => ({
    CustomParagraphNode: jest.fn(),
}));

jest.mock('./customNodes/ClickableDecoratorNode', () => ({
    ClickableDecoratorNode: jest.fn(),
}));

const mockRegisterCommand = jest.fn();

jest.mock('./plugins/AssociationDecoratorPlugin', () => ({
    AssociationDecoratorPlugin: jest.fn(({ registerCommand }) => {
        if (registerCommand) {
            mockRegisterCommand.mockImplementation(registerCommand);
        }
        return <div>AssociationDecoratorPlugin</div>;
    }),
}));

jest.mock('../ThreadWriterToolbar', () => ({
    Toolbar: jest.fn(() => <div>Toolbar</div>),
}));

jest.mock('../AssociationPanel', () => ({
    AssociationPanel: jest.fn(() => <div>AssociationPanel</div>),
}));

// Helper mock data
const mockCurrentSelections = {
    currentStory: { story_id: 'test-story-id', chapters: [{ id: 'test-chapter-id' }] },
    currentChapter: { id: 'test-chapter-id' },
    setCurrentStory: jest.fn(),
    setCurrentChapter: jest.fn(),
    setCurrentStoryAction: jest.fn(),
    deselectStory: jest.fn(),
};

const mockLoader = { setIsLoaderVisible: jest.fn() };

const mockToaster = { setAlertState: jest.fn() };

// Tests
describe('ThreadWriter', () => {
    beforeEach(() => {
        (useLoader as jest.Mock).mockReturnValue(mockLoader);
        (useToaster as jest.Mock).mockReturnValue(mockToaster);
        (useCurrentSelections as jest.Mock).mockReturnValue(mockCurrentSelections);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders ThreadWriter component with plugins', () => {
        render(<ThreadWriter />);

        expect(screen.getByText('Toolbar')).toBeInTheDocument();
        expect(screen.getByText('RichTextPlugin')).toBeInTheDocument();
        expect(screen.getByText('OnChangePlugin')).toBeInTheDocument();
        expect(screen.getByText('HistoryPlugin')).toBeInTheDocument();
        expect(screen.getByText('AssociationDecoratorPlugin')).toBeInTheDocument();
        expect(screen.getByText('AssociationPanel')).toBeInTheDocument();
    });

    test('shows loader during data fetching', async () => {
        render(<ThreadWriter />);

        expect(mockLoader.setIsLoaderVisible).toHaveBeenCalledWith(true);

        // Simulate data fetching completion
        await waitFor(() => {
            expect(mockLoader.setIsLoaderVisible).toHaveBeenCalledWith(false);
        });
    });

    test('fetches and sets story blocks on mount', async () => {
        const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    { chunk: { Value: JSON.stringify({ type: 'custom-paragraph', children: [] }) }, key_id: { Value: '1' } },
                ],
            }),
        } as Response);

        render(<ThreadWriter />);

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/stories/test-story-id/content?key=&chapter=test-chapter-id');
        });

        expect(mockLoader.setIsLoaderVisible).toHaveBeenCalledWith(false);

        mockFetch.mockRestore();
    });

    test('handles editor updates on content change', async () => {
        render(<ThreadWriter />);

        // Simulate onChange handler
        const onChangePlugin = screen.getByTestId('onChangePlugin');
        onChangePlugin.click();

        await waitFor(() => {
            expect(mockToaster.setAlertState).not.toHaveBeenCalledWith(expect.anything());
        });
    });

    test('processes paste command correctly', async () => {
        render(<ThreadWriter />);

        // Simulate paste event
        const clipboardEvent = { preventDefault: jest.fn(), clipboardData: { getData: jest.fn(() => 'pasted text') } };
        mockRegisterCommand(PASTE_COMMAND, clipboardEvent);

        await waitFor(() => {
            expect(clipboardEvent.preventDefault).toHaveBeenCalled();
            expect(clipboardEvent.clipboardData.getData).toHaveBeenCalledWith('text/plain');
        });
    });

    test('displays alert for large paste operations', async () => {
        render(<ThreadWriter />);

        // Simulate large paste operation
        const clipboardEvent = {
            preventDefault: jest.fn(),
            clipboardData: { getData: jest.fn(() => 'line1\nline2\n'.repeat(51)) }, // Over 100 lines
        };
        mockRegisterCommand(PASTE_COMMAND, clipboardEvent);

        await waitFor(() => {
            expect(mockToaster.setAlertState).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Oh, jeez',
                    message: expect.stringContaining('You\'re pasting a lot of paragraphs.'),
                })
            );
        });
    });
});
