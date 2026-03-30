import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommentComposer } from '../CommentComposer';

vi.mock('../readonlyviewer.module.css', () => ({
  default: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === 'string' ? prop : '') },
  ),
}));

describe('CommentComposer', () => {
  const defaultProps = {
    selectedText: 'The quick brown fox',
    readerName: 'Alice Smith',
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the selected text snippet', () => {
    render(<CommentComposer {...defaultProps} />);

    // The snippet container should display the selected text
    const snippetEl = document.querySelector('.commentSnippet');
    expect(snippetEl).not.toBeNull();
    expect(snippetEl!.textContent).toContain('The quick brown fox');
  });

  it('truncates selected text longer than 100 characters', () => {
    const longText = 'a'.repeat(120);
    render(<CommentComposer {...defaultProps} selectedText={longText} />);

    // The snippet container should have the truncated text with "..."
    const snippetEl = document.querySelector('.commentSnippet');
    expect(snippetEl).not.toBeNull();
    expect(snippetEl!.textContent).toContain('...');
    // Should only contain 100 chars of the original text (not all 120)
    expect(snippetEl!.textContent).not.toContain('a'.repeat(120));
  });

  it('renders "Commenting as" with reader name', () => {
    render(<CommentComposer {...defaultProps} />);

    expect(screen.getByText(/Commenting as/)).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('disables the submit button when body is empty', () => {
    render(<CommentComposer {...defaultProps} />);

    const submitBtn = screen.getByRole('button', { name: /comment/i });
    expect(submitBtn).toBeDisabled();
  });

  it('disables the submit button when body is only whitespace', () => {
    render(<CommentComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Write your comment...');
    fireEvent.change(textarea, { target: { value: '   ' } });

    const submitBtn = screen.getByRole('button', { name: /comment/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables the submit button when body has non-whitespace text', () => {
    render(<CommentComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Write your comment...');
    fireEvent.change(textarea, { target: { value: 'Great chapter' } });

    const submitBtn = screen.getByRole('button', { name: /comment/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls onSubmit with trimmed body text', () => {
    const onSubmit = vi.fn();
    render(<CommentComposer {...defaultProps} onSubmit={onSubmit} />);

    const textarea = screen.getByPlaceholderText('Write your comment...');
    fireEvent.change(textarea, { target: { value: '  Nice work!  ' } });

    const submitBtn = screen.getByRole('button', { name: /comment/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith('Nice work!');
  });

  it('clears the textarea after submit', () => {
    render(<CommentComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Write your comment...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A comment' } });
    fireEvent.click(screen.getByRole('button', { name: /comment/i }));

    expect(textarea.value).toBe('');
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<CommentComposer {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('enforces maxLength on the textarea', () => {
    render(<CommentComposer {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Write your comment...');
    expect(textarea).toHaveAttribute('maxLength', '2000');
  });
});
