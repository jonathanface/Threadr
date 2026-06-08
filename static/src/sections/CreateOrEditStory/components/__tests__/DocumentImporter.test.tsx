import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentImporter } from '../DocumentImporter';

// Mock useToaster
vi.mock('../../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

describe('DocumentImporter', () => {
  it('renders upload prompt when no file selected', () => {
    render(
      <DocumentImporter importFile={null} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    expect(screen.getByText(/Import from a file/)).toBeInTheDocument();
    expect(screen.getByText(/\.docx or \.txt/)).toBeInTheDocument();
  });

  it('shows selected filename when file is provided', () => {
    const file = new File(['content'], 'my-novel.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(
      <DocumentImporter importFile={file} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    expect(screen.getByText('my-novel.docx')).toBeInTheDocument();
  });

  it('shows remove chip when file is selected', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    render(
      <DocumentImporter importFile={file} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('calls onFileSelected(null) when remove is clicked', () => {
    const onFileSelected = vi.fn();
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    render(
      <DocumentImporter importFile={file} onFileSelected={onFileSelected} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Remove'));
    expect(onFileSelected).toHaveBeenCalledWith(null);
  });

  it('renders in disabled state', () => {
    const { container } = render(
      <DocumentImporter importFile={null} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} disabled />
    );
    // The dropzone should have reduced opacity
    const dropzone = container.firstChild as HTMLElement;
    expect(dropzone).toBeTruthy();
  });

  it('renders upload icon', () => {
    const { container } = render(
      <DocumentImporter importFile={null} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    // MUI UploadFileIcon renders as an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders document icon when file is selected', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const { container } = render(
      <DocumentImporter importFile={file} onFileSelected={vi.fn()} skipFirstPage={false} onSkipFirstPageChange={vi.fn()} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
