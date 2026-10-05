import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { DraftsDialog } from '../subcomponents/DocumentMenu/DraftsDialog';
import { api } from '../../../api';
import { Story } from '../../../types/Story';

vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    story: {
      story_id: 'root-1',
      chapters: [
        { id: 'src-ch-1', place: 1 },
        { id: 'src-ch-2', place: 2 },
        { id: 'src-ch-3', place: 3 },
      ],
    },
    chapter: { id: 'src-ch-1' },
    setChapter: vi.fn(),
  }),
}));

// react-router-dom's useNavigate is mocked so tests can inspect where
// the dialog tries to send the user after create / switch.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const makeDraft = (overrides: Partial<Story> = {}): Story => ({
  story_id: 'root-1',
  title: 'My Story',
  description: '',
  chapters: [],
  image_url: '',
  draft_name: 'Original',
  is_current_draft: true,
  ...overrides,
});

const renderDialog = (props: { open: boolean }) => {
  const setOpen = vi.fn();
  return {
    setOpen,
    ...render(
      <MemoryRouter>
        <DraftsDialog open={props.open} setOpen={setOpen} />
      </MemoryRouter>,
    ),
  };
};

describe('DraftsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    // Default location: no chapter param. Tests that need one override.
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/stories/root-1', href: '/stories/root-1' },
      writable: true,
    });
  });

  it('renders the dialog title and create form', async () => {
    renderDialog({ open: true });
    expect(await screen.findByText('Drafts')).toBeInTheDocument();
    expect(screen.getByLabelText(/new draft name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create draft/i })).toBeInTheDocument();
  });

  it('fetches drafts on open and renders rows', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });

    renderDialog({ open: true });

    await waitFor(() => {
      expect(screen.getByText('Original')).toBeInTheDocument();
      expect(screen.getByText('Alt')).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith('/stories/root-1/drafts');
  });

  it('disables Create draft when name is blank', async () => {
    renderDialog({ open: true });
    const createBtn = screen.getByRole('button', { name: /create draft/i });
    expect(createBtn).toBeDisabled();
  });

  it('shows a loading indicator while the clone is in-flight', async () => {
    // Pending promise so the "creating" state stays visible long enough
    // to assert against.
    let resolve: (v: { data: Story }) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as unknown as ReturnType<typeof api.post>,
    );
    renderDialog({ open: true });

    const nameInput = screen.getByLabelText(/new draft name/i);
    fireEvent.change(nameInput, { target: { value: 'Alt ending' } });
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    // Button swaps to "Cloning story..." and the auxiliary status copy
    // appears.
    expect(await screen.findByRole('button', { name: /cloning story/i })).toBeInTheDocument();
    expect(screen.getByText(/copying chapters, blocks, and outline/i)).toBeInTheDocument();
    // Close is disabled during the clone so the user can't dismiss and
    // lose the in-flight state visually.
    expect(screen.getByRole('button', { name: /close/i })).toBeDisabled();

    // Let the promise resolve so the test cleans up.
    resolve!({ data: makeDraft({ story_id: 'new-draft' }) });
    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });
  });

  it('POSTs to create-draft endpoint when Create draft is clicked', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: makeDraft({ story_id: 'draft-new', original_story_id: 'root-1', draft_name: 'New' }),
    });
    renderDialog({ open: true });

    const nameInput = screen.getByLabelText(/new draft name/i);
    fireEvent.change(nameInput, { target: { value: 'New' } });
    const createBtn = screen.getByRole('button', { name: /create draft/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/stories/root-1/drafts', { draft_name: 'New' });
    });
  });

  it('maps the current ?chapter= to the equivalent chapter in the new draft', async () => {
    // User is viewing the middle source chapter.
    Object.defineProperty(window, 'location', {
      value: {
        search: '?chapter=src-ch-2',
        pathname: '/stories/root-1',
        href: '/stories/root-1?chapter=src-ch-2',
      },
      writable: true,
    });

    // Backend response's chapters are in the same order as the source,
    // with fresh ids — so index 1 (zero-based) is the equivalent of
    // src-ch-2.
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...makeDraft({ story_id: 'draft-new', original_story_id: 'root-1', draft_name: 'Alt' }),
        chapters: [
          { id: 'new-ch-1', story_id: 'draft-new', place: 1, title: '', tableNotReady: false },
          { id: 'new-ch-2', story_id: 'draft-new', place: 2, title: '', tableNotReady: false },
          { id: 'new-ch-3', story_id: 'draft-new', place: 3, title: '', tableNotReady: false },
        ],
      },
    });

    renderDialog({ open: true });
    fireEvent.change(screen.getByLabelText(/new draft name/i), { target: { value: 'Alt' } });
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/stories/draft-new?chapter=new-ch-2');
    });
  });

  it('maps the chapter when switching to another draft', async () => {
    // User is viewing the middle source chapter.
    Object.defineProperty(window, 'location', {
      value: {
        search: '?chapter=src-ch-2',
        pathname: '/stories/root-1',
        href: '/stories/root-1?chapter=src-ch-2',
      },
      writable: true,
    });
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/stories/root-1/drafts') {
        return {
          data: [
            makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
            makeDraft({ story_id: 'draft-b', original_story_id: 'root-1', draft_name: 'Alt' }),
          ],
        };
      }
      if (url === '/stories/draft-b') {
        return {
          data: {
            ...makeDraft({ story_id: 'draft-b', original_story_id: 'root-1', draft_name: 'Alt' }),
            chapters: [
              { id: 'alt-ch-1', story_id: 'draft-b', place: 1, title: '', tableNotReady: false },
              { id: 'alt-ch-2', story_id: 'draft-b', place: 2, title: '', tableNotReady: false },
              { id: 'alt-ch-3', story_id: 'draft-b', place: 3, title: '', tableNotReady: false },
            ],
          },
        };
      }
      return { data: [] };
    });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    // Click the "Alt" draft row's ListItemText to trigger switch.
    const altRow = screen.getByText('Alt').closest('li');
    const altTextNode = altRow!.querySelector('div.MuiListItemText-root') as HTMLElement;
    fireEvent.click(altTextNode);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/stories/draft-b?chapter=alt-ch-2');
    });
  });

  it('falls back to the base story url when no chapter is selected', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: makeDraft({ story_id: 'draft-new', original_story_id: 'root-1', draft_name: 'A' }),
    });

    renderDialog({ open: true });
    fireEvent.change(screen.getByLabelText(/new draft name/i), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/stories/draft-new');
    });
  });

  it('surfaces a 402 as a subscriber-only message', async () => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: { status: 402, data: {} },
    });
    renderDialog({ open: true });
    await waitFor(() => {
      expect(screen.getByText(/subscribers/i)).toBeInTheDocument();
    });
  });

  it('shows empty-state copy when there are no drafts', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderDialog({ open: true });
    await waitFor(() => {
      expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    });
  });

  it('calls set-current endpoint when the non-current star is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    vi.mocked(api.post).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => {
      expect(screen.getByText('Alt')).toBeInTheDocument();
    });

    // The non-current draft's star button is enabled; the current one's is disabled.
    const stars = screen.getAllByRole('button', { name: /set as current/i });
    const enabled = stars.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toBeDefined();
    fireEvent.click(enabled!);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/stories/draft-2/drafts/current', {});
    });
  });

  it('shows a destructive confirmation before deleting a draft', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    // Click delete on the "Alt" draft row (identified via its listitem).
    const altRow = screen.getByText('Alt').closest('li');
    const deleteBtn = altRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    // Confirm dialog appears; API not yet called.
    expect(await screen.findByText(/Delete draft "Alt"/i)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();

    // Confirm — now the API fires.
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/stories/draft-2');
    });
  });

  it('shows the re-root warning when deleting the original with drafts present', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', title: 'My Story', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    const rootRow = screen.getByText('Original').closest('li');
    const deleteBtn = rootRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    // Root-delete confirm names the draft that will be promoted and
    // explains the irreversible content loss.
    expect(await screen.findByText(/Delete the original of "My Story"/i)).toBeInTheDocument();
    expect(screen.getByText(/promote/i)).toBeInTheDocument();
    expect(screen.getByText(/permanently removed/i)).toBeInTheDocument();
    // The non-current draft "Alt" is the sole non-root candidate, so it is
    // the preview promotion target — mentioned both in the drafts list and
    // in the confirm dialog's promotion message.
    expect(screen.getAllByText('Alt').length).toBeGreaterThanOrEqual(2);
  });

  it('cancels the confirm dialog without calling the API', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    const altRow = screen.getByText('Alt').closest('li');
    const deleteBtn = altRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);

    expect(await screen.findByText(/Delete draft "Alt"/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Delete draft "Alt"/i)).not.toBeInTheDocument();
    });
    expect(api.delete).not.toHaveBeenCalled();
  });
});
