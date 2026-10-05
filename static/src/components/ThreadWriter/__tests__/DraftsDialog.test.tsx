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
    story: { story_id: 'root-1' },
    chapter: { id: 'ch1' },
    setChapter: vi.fn(),
  }),
}));

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

  it('calls delete endpoint on draft row (not root)', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-2', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => {
      expect(screen.getByText('Alt')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    const enabled = deleteButtons.find((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toBeDefined();
    fireEvent.click(enabled!);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/stories/draft-2');
    });
  });
});
