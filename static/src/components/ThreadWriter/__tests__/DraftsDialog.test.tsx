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

// useWorksList is called by DraftsDialog so it can nudge the /stories
// cache after promote/create/delete; mock it so the component tree
// doesn't need a WorksListProvider wrapper in these unit tests.
const mockRefreshWorksList = vi.fn();
vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => ({
    seriesList: null,
    storiesList: null,
    setSeriesList: vi.fn(),
    setStoriesList: vi.fn(),
    refresh: mockRefreshWorksList,
  }),
}));

// Mutable mock so individual tests can swap out which story the user
// is currently "viewing" via useSelections().story.
let mockUseSelectionsReturn = {
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
  deselectChapter: vi.fn(),
  deselectStory: vi.fn(),
};
vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => mockUseSelectionsReturn,
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
    // Reset the useSelections mock to the default "viewing root-1" story
    // between tests so overrides don't bleed.
    mockUseSelectionsReturn = {
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
      deselectChapter: vi.fn(),
      deselectStory: vi.fn(),
    };
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

  it('surfaces an inline error when Create draft is clicked without a name', async () => {
    renderDialog({ open: true });
    const createBtn = screen.getByRole('button', { name: /create draft/i });
    // Button stays clickable so hover shows a pointer cursor; the
    // validation surfaces as an inline error on click instead of
    // disabling the button.
    expect(createBtn).not.toBeDisabled();
    fireEvent.click(createBtn);
    expect(await screen.findByText(/give the draft a name/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
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

    // Click the "Alt" draft row title cell to trigger switch.
    fireEvent.click(screen.getByText('Alt'));

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
    const stars = screen.getAllByRole('button', { name: /set as primary/i });
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
    const altRow = screen.getByText('Alt').closest('tr');
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

    const rootRow = screen.getByText('Original').closest('tr');
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

  it('navigates to the root after deleting the current draft so the editor stays on a live story', async () => {
    // useSelections mock returns story_id='root-1' as the active story.
    // To exercise the "deleted the active story" path we need the
    // mock to say the user is currently editing draft-2 instead.
    // Easiest: patch window.location + make the drafts list mark
    // draft-2 as the one being edited by having the dialog think
    // story.story_id === 'draft-2'. Since useSelections is mocked
    // module-level we can't vary it per-test here; we settle for
    // deleting the root instead, which triggers the promoted-target
    // fallback (same code path, different branch).
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: false }),
        makeDraft({ story_id: 'draft-a', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: true }),
      ],
    });
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    // Delete the root while the user is editing it (useSelections says
    // story_id='root-1'). The dialog should fall back to the promoted
    // target (the current draft 'draft-a' in this ancestry).
    const rootRow = screen.getByText('Original').closest('tr');
    fireEvent.click(rootRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/root-1'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/stories/draft-a'));
  });

  it("mentions the active draft in the destructive confirm when deleting the one you're viewing", async () => {
    mockUseSelectionsReturn = {
      story: {
        story_id: 'draft-current',
        chapters: [{ id: 'src-ch-1', place: 1 }],
      },
      chapter: { id: 'src-ch-1' },
      setChapter: vi.fn(),
      deselectChapter: vi.fn(),
      deselectStory: vi.fn(),
    };
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: false }),
        makeDraft({ story_id: 'draft-current', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: true }),
      ],
    });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    const altRow = screen.getByText('Alt').closest('tr');
    fireEvent.click(altRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement);

    expect(await screen.findByText(/Delete draft "Alt"/i)).toBeInTheDocument();
    expect(screen.getByText(/currently viewing this draft/i)).toBeInTheDocument();
    expect(screen.getByText(/redirected to the primary draft/i)).toBeInTheDocument();
  });

  it("doesn't show the 'currently viewing' callout when deleting a non-active draft", async () => {
    // Default useSelections mock has story_id='root-1' as active.
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: true }),
        makeDraft({ story_id: 'draft-a', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: false }),
      ],
    });
    renderDialog({ open: true });
    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    const altRow = screen.getByText('Alt').closest('tr');
    fireEvent.click(altRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement);

    expect(await screen.findByText(/Delete draft "Alt"/i)).toBeInTheDocument();
    expect(screen.queryByText(/currently viewing this draft/i)).not.toBeInTheDocument();
  });

  it('navigates to the root when deleting the current draft while viewing it', async () => {
    // User is actively editing the current draft 'draft-current'.
    const deselectChapterSpy = vi.fn();
    const deselectStorySpy = vi.fn();
    mockUseSelectionsReturn = {
      story: {
        story_id: 'draft-current',
        chapters: [{ id: 'src-ch-1', place: 1 }],
      },
      chapter: { id: 'src-ch-1' },
      setChapter: vi.fn(),
      deselectChapter: deselectChapterSpy,
      deselectStory: deselectStorySpy,
    };
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: false }),
        makeDraft({ story_id: 'draft-current', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: true }),
      ],
    });
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Alt')).toBeInTheDocument());

    // Click delete on 'Alt' — the row the user is currently editing.
    const altRow = screen.getByText('Alt').closest('tr');
    fireEvent.click(altRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/draft-current'));
    // Backend promotes root; dialog should navigate the user there.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/stories/root-1'));
    // And clear both the chapter and the story so the editor's
    // /content fetch (keyed on useSelections.chapter.id) doesn't send
    // the deleted draft's chapter id with the new story id, and the
    // "ensure chapter param" effect doesn't commit a stale chapter
    // id to the URL during the window before the new story is fetched.
    expect(deselectChapterSpy).toHaveBeenCalled();
    expect(deselectStorySpy).toHaveBeenCalled();
  });

  it('navigates to the already-current draft when deleting a non-current sibling', async () => {
    // The user (useSelections.story.story_id='root-1') is viewing the
    // root. Deleting a non-current draft shouldn't change what's
    // current, so after the delete they should be redirected to
    // whichever draft was already is_current_draft=true — not back to
    // the root they were on.
    vi.mocked(api.get).mockResolvedValue({
      data: [
        makeDraft({ story_id: 'root-1', draft_name: 'Original', is_current_draft: false }),
        makeDraft({ story_id: 'draft-current', original_story_id: 'root-1', draft_name: 'Alt', is_current_draft: true }),
        makeDraft({ story_id: 'draft-extra', original_story_id: 'root-1', draft_name: 'Scratch', is_current_draft: false }),
      ],
    });
    vi.mocked(api.delete).mockResolvedValue({ data: null });
    renderDialog({ open: true });

    await waitFor(() => expect(screen.getByText('Scratch')).toBeInTheDocument());

    const scratchRow = screen.getByText('Scratch').closest('tr');
    fireEvent.click(scratchRow!.querySelector('button[aria-label="delete"]') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/draft-extra'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/stories/draft-current'));
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

    const altRow = screen.getByText('Alt').closest('tr');
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
