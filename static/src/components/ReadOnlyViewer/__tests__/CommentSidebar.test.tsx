import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommentSidebar } from '../CommentSidebar';
import { Comment } from '../../../types/Sharing';

// Stub CSS modules so class-name lookups don't break
vi.mock('../readonlyviewer.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === 'string' ? prop : '') },
  ),
}));

const makeComment = (overrides: Partial<Comment> = {}): Comment => ({
  comment_id: 'c1',
  share_token: 'tok',
  story_id: 's1',
  chapter_id: 'ch1',
  block_key_id: 'bk1',
  anchor_offset: 0,
  focus_offset: 5,
  anchor_text_snapshot: 'hello',
  reader_email: 'reader@example.com',
  reader_first_name: 'Alice',
  reader_last_name: 'Smith',
  body: 'Nice paragraph!',
  created_at: 1700000000,
  resolved: false,
  ...overrides,
});

describe('CommentSidebar', () => {
  const defaultProps = {
    comments: [] as Comment[],
    readerFirstName: 'Alice',
    readerLastName: 'Smith',
    onDelete: vi.fn(),
    focusedCommentId: null as string | null,
    onFocusClear: vi.fn(),
    commentPositions: {} as Record<string, number>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders "No comments yet" when comments array is empty', () => {
    render(<CommentSidebar {...defaultProps} />);
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument();
  });

  it('renders comment cards with correct body and snippet', () => {
    const comments = [
      makeComment({ comment_id: 'c1', body: 'Great work!', anchor_text_snapshot: 'some text' }),
      makeComment({ comment_id: 'c2', body: 'Needs revision', anchor_text_snapshot: 'other text' }),
    ];
    render(<CommentSidebar {...defaultProps} comments={comments} />);

    expect(screen.getByText('Great work!')).toBeInTheDocument();
    expect(screen.getByText('Needs revision')).toBeInTheDocument();
  });

  it('shows delete button only for own comments', () => {
    const ownComment = makeComment({
      comment_id: 'own',
      reader_first_name: 'Alice',
      reader_last_name: 'Smith',
      body: 'My comment',
    });
    const otherComment = makeComment({
      comment_id: 'other',
      reader_first_name: 'Bob',
      reader_last_name: 'Jones',
      body: 'Their comment',
    });

    render(
      <CommentSidebar
        {...defaultProps}
        comments={[ownComment, otherComment]}
      />,
    );

    // There should be exactly one Delete button (for the own comment)
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it('does not show delete button for resolved own comments', () => {
    const resolvedOwn = makeComment({
      comment_id: 'res',
      reader_first_name: 'Alice',
      reader_last_name: 'Smith',
      body: 'Resolved comment',
      resolved: true,
    });

    render(<CommentSidebar {...defaultProps} comments={[resolvedOwn]} />);

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows "Acknowledged" chip for resolved comments', () => {
    const resolved = makeComment({
      comment_id: 'res',
      resolved: true,
      body: 'Acknowledged comment body',
    });

    render(<CommentSidebar {...defaultProps} comments={[resolved]} />);

    expect(screen.getByText('Acknowledged')).toBeInTheDocument();
  });

  it('calls onDelete with comment_id when Delete is clicked', () => {
    const onDelete = vi.fn();
    const comment = makeComment({ comment_id: 'del-me', body: 'Delete me' });

    render(
      <CommentSidebar {...defaultProps} comments={[comment]} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('del-me');
  });

  it('calls onFocusClear after timeout when focusedCommentId is set', async () => {
    const onFocusClear = vi.fn();
    const comment = makeComment({ comment_id: 'focused' });

    render(
      <CommentSidebar
        {...defaultProps}
        comments={[comment]}
        focusedCommentId="focused"
        onFocusClear={onFocusClear}
      />,
    );

    // onFocusClear should not have been called yet
    expect(onFocusClear).not.toHaveBeenCalled();

    // Advance timers past the 2000ms timeout used in the component
    vi.advanceTimersByTime(2000);

    expect(onFocusClear).toHaveBeenCalledTimes(1);
  });

  it('renders the Comments header', () => {
    render(<CommentSidebar {...defaultProps} />);
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('renders anchor text snippet in a snippet container', () => {
    const comment = makeComment({ anchor_text_snapshot: 'highlighted words' });
    render(<CommentSidebar {...defaultProps} comments={[comment]} />);

    // The snippet div has class commentSnippet and contains the text
    const snippetEl = document.querySelector('.commentSnippet');
    expect(snippetEl).not.toBeNull();
    expect(snippetEl!.textContent).toContain('highlighted words');
  });
});
