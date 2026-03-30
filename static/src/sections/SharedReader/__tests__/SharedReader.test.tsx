import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SharedReaderPage } from '../index';
import { sharedApi } from '../../../api/shared';
import { SharedStoryResponse } from '../../../types/Sharing';

// Mock the shared API
vi.mock('../../../api/shared', () => ({
  sharedApi: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock react-router-dom useParams
let mockToken = 'test-token-abc';
vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: mockToken }),
}));

// Mock ReadOnlyViewer to avoid Lexical rendering complexity
vi.mock('../../../components/ReadOnlyViewer', () => ({
  ReadOnlyViewer: (props: Record<string, unknown>) => (
    <div data-testid="read-only-viewer">
      ReadOnlyViewer: chapterId={String(props.chapterId)}
      {props.chapterSelector as React.ReactNode}
    </div>
  ),
}));

const makeStoryResponse = (
  overrides: Partial<SharedStoryResponse> = {},
): SharedStoryResponse => ({
  story_id: 's1',
  title: 'My Test Story',
  description: 'A description of the story',
  image_url: '',
  chapters: [
    { id: 'ch1', story_id: 's1', place: 0, title: 'Chapter One' },
  ],
  comments_enabled: true,
  reader_email: 'reader@example.com',
  reader_first_name: 'Alice',
  reader_last_name: 'Smith',
  ...overrides,
});

describe('SharedReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken = 'test-token-abc';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    // Never resolve, so loading stays
    vi.mocked(sharedApi.get).mockReturnValue(new Promise(() => {}));

    render(<SharedReaderPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error message for expired links (410 response)', async () => {
    // The component checks `"response" in err` so the error object must have a response property
    const err = Object.assign(new Error('gone'), { response: { status: 410 } });
    vi.mocked(sharedApi.get).mockRejectedValue(err);

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(
        screen.getByText('This share link has expired or been revoked.'),
      ).toBeInTheDocument();
    });
  });

  it('shows error message for not found links (404 response)', async () => {
    const err = Object.assign(new Error('not found'), { response: { status: 404 } });
    vi.mocked(sharedApi.get).mockRejectedValue(err);

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(screen.getByText('Share link not found.')).toBeInTheDocument();
    });
  });

  it('shows generic error message for other failures', async () => {
    // Plain Error has no `response` property, so the component falls through to generic message
    vi.mocked(sharedApi.get).mockRejectedValue(new Error('network down'));

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load shared story.'),
      ).toBeInTheDocument();
    });
  });

  it('renders story title and description after successful load', async () => {
    vi.mocked(sharedApi.get).mockResolvedValue({
      data: makeStoryResponse(),
    });

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(screen.getByText('My Test Story')).toBeInTheDocument();
    });
    expect(
      screen.getByText('A description of the story'),
    ).toBeInTheDocument();
  });

  it('renders chapter dropdown when multiple chapters exist', async () => {
    vi.mocked(sharedApi.get).mockResolvedValue({
      data: makeStoryResponse({
        chapters: [
          { id: 'ch1', story_id: 's1', place: 0, title: 'Chapter One' },
          { id: 'ch2', story_id: 's1', place: 1, title: 'Chapter Two' },
        ],
      }),
    });

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(screen.getByText('My Test Story')).toBeInTheDocument();
    });

    // MUI Select renders a combobox role element
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('does not render chapter dropdown for a single chapter', async () => {
    vi.mocked(sharedApi.get).mockResolvedValue({
      data: makeStoryResponse({
        chapters: [
          { id: 'ch1', story_id: 's1', place: 0, title: 'Only Chapter' },
        ],
      }),
    });

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(screen.getByText('My Test Story')).toBeInTheDocument();
    });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the ReadOnlyViewer after successful load', async () => {
    vi.mocked(sharedApi.get).mockResolvedValue({
      data: makeStoryResponse(),
    });

    render(<SharedReaderPage />);

    await waitFor(() => {
      expect(screen.getByTestId('read-only-viewer')).toBeInTheDocument();
    });
  });

  it('auto-selects the first chapter sorted by place', async () => {
    vi.mocked(sharedApi.get).mockResolvedValue({
      data: makeStoryResponse({
        chapters: [
          { id: 'ch-second', story_id: 's1', place: 1, title: 'Second' },
          { id: 'ch-first', story_id: 's1', place: 0, title: 'First' },
        ],
      }),
    });

    render(<SharedReaderPage />);

    await waitFor(() => {
      // The ReadOnlyViewer mock displays the chapterId
      expect(
        screen.getByText(/chapterId=ch-first/),
      ).toBeInTheDocument();
    });
  });
});
