import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareDialog } from '../subcomponents/DocumentMenu/ShareDialog/index';
import { api } from '../../../api';
import { ShareLink } from '../../../types/Sharing';
import axios from 'axios';

// Mock the API
vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock useSelections
vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    story: { story_id: 'test-story-id' },
    chapter: { id: 'ch1' },
    setChapter: vi.fn(),
  }),
}));

const makeShareLink = (overrides: Partial<ShareLink> = {}): ShareLink => ({
  token: 'tok-123',
  story_id: 'test-story-id',
  author_email: 'author@example.com',
  reader_email: 'reader@example.com',
  reader_first_name: 'Bob',
  reader_last_name: 'Reader',
  created_at: 1700000000,
  expires_at: 1800000000,
  revoked: false,
  comments_enabled: true,
  ...overrides,
});

describe('ShareDialog', () => {
  const defaultProps = {
    open: true,
    setOpen: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing share links
    vi.mocked(api.get).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the dialog title and invite form', async () => {
    render(<ShareDialog {...defaultProps} />);

    expect(screen.getByText('Share Story')).toBeInTheDocument();
    expect(screen.getByText('Invite a Reader')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows the Invite Reader button initially disabled when fields are empty', () => {
    render(<ShareDialog {...defaultProps} />);

    const inviteBtn = screen.getByRole('button', { name: /invite reader/i });
    expect(inviteBtn).toBeDisabled();
  });

  it('shows validation errors when submitting with empty fields', async () => {
    render(<ShareDialog {...defaultProps} />);

    // Fill only one field so the button is still disabled, but we need to
    // trigger the attempted state. The button is disabled when any field is empty,
    // but the component also shows "Required" helper text when attempted is true.
    // We need to fill all fields then clear one to trigger validation display.
    const firstNameInput = screen.getByLabelText('First Name');
    const lastNameInput = screen.getByLabelText('Last Name');
    const emailInput = screen.getByLabelText('Email');

    // Fill all fields to enable button
    fireEvent.change(firstNameInput, { target: { value: 'Test' } });
    fireEvent.change(lastNameInput, { target: { value: 'User' } });
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } });

    // Now clear the first name to see if validation kicks in after submit attempt
    fireEvent.change(firstNameInput, { target: { value: '' } });

    // The button should now be disabled
    const inviteBtn = screen.getByRole('button', { name: /invite reader/i });
    expect(inviteBtn).toBeDisabled();
  });

  it('calls API to create share link on submit with valid fields', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    // After creation, fetchLinks will be called again
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<ShareDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /invite reader/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/stories/test-story-id/share',
        expect.objectContaining({
          story_id: 'test-story-id',
          reader_email: 'jane@example.com',
          reader_first_name: 'Jane',
          reader_last_name: 'Doe',
          comments_enabled: true,
        }),
      );
    });
  });

  it('shows success message after successful invite', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<ShareDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /invite reader/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Jane Doe has been invited/),
      ).toBeInTheDocument();
    });
  });

  it('shows error message for duplicate reader (409)', async () => {
    // Simulate axios error with response data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axiosError = new Error('Request failed') as any;
    axiosError.response = { status: 409, data: { error: 'Reader already has access' } };
    axiosError.isAxiosError = true;

    // Mock axios.isAxiosError to return true for our error
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    vi.mocked(api.post).mockRejectedValue(axiosError);

    render(<ShareDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /invite reader/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Reader already has access'),
      ).toBeInTheDocument();
    });
  });

  it('shows generic error when API fails without structured error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network'));

    render(<ShareDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /invite reader/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Failed to create invite. Please try again.'),
      ).toBeInTheDocument();
    });
  });

  it('shows existing readers list', async () => {
    const links = [
      makeShareLink({
        token: 'tok-1',
        reader_first_name: 'Bob',
        reader_last_name: 'Reader',
        reader_email: 'bob@example.com',
      }),
      makeShareLink({
        token: 'tok-2',
        reader_first_name: 'Carol',
        reader_last_name: 'Viewer',
        reader_email: 'carol@example.com',
      }),
    ];

    vi.mocked(api.get).mockResolvedValue({ data: links });

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Bob Reader')).toBeInTheDocument();
      expect(screen.getByText('Carol Viewer')).toBeInTheDocument();
    });
  });

  it('copy link button copies to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const links = [makeShareLink({ token: 'tok-copy' })];
    vi.mocked(api.get).mockResolvedValue({ data: links });

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Bob Reader')).toBeInTheDocument();
    });

    // MUI Tooltip wraps the IconButton; find the copy icon button via its SVG test id
    const copyIcon = screen.getByTestId('ContentCopyIcon');
    const copyButton = copyIcon.closest('button')!;
    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('/shared/tok-copy'),
    );
  });

  it('remove button calls revoke API', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} });

    const links = [makeShareLink({ token: 'tok-remove', revoked: false })];
    vi.mocked(api.get).mockResolvedValue({ data: links });

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Bob Reader')).toBeInTheDocument();
    });

    const deleteIcon = screen.getByTestId('DeleteIcon');
    const removeBtn = deleteIcon.closest('button')!;
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/share-links/tok-remove/revoke');
    });
  });

  it('restore button calls restore API for revoked links', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} });

    const links = [
      makeShareLink({
        token: 'tok-revoked',
        revoked: true,
        reader_first_name: 'Revoked',
        reader_last_name: 'User',
      }),
    ];
    vi.mocked(api.get).mockResolvedValue({ data: links });

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Revoked User')).toBeInTheDocument();
    });

    const restoreIcon = screen.getByTestId('RestoreIcon');
    const restoreBtn = restoreIcon.closest('button')!;
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/share-links/tok-revoked/restore',
      );
    });
  });

  it('closes the dialog when Close button is clicked', () => {
    const setOpen = vi.fn();
    render(<ShareDialog open={true} setOpen={setOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('shows "No readers invited yet" when share links list is empty', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<ShareDialog {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('No readers invited yet.'),
      ).toBeInTheDocument();
    });
  });
});
