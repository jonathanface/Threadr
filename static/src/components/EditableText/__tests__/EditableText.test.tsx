import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EditableText } from '../index';

describe('EditableText', () => {
  const mockOnTextChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to trigger double-click (component uses onClick with event.detail check)
  const triggerDoubleClick = (element: HTMLElement) => {
    fireEvent.click(element, { detail: 1 });
    fireEvent.click(element, { detail: 2 });
  };

  describe('Rendering', () => {
    it('should render with initial text value', () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should show tooltip on hover', () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      expect(container).toBeInTheDocument();
    });

    it('should update when textValue prop changes', () => {
      const { rerender } = render(
        <EditableText
          textValue="Initial Title"
          onTextChange={mockOnTextChange}
        />
      );

      expect(screen.getByText('Initial Title')).toBeInTheDocument();

      rerender(
        <EditableText
          textValue="Updated Title"
          onTextChange={mockOnTextChange}
        />
      );

      expect(screen.getByText('Updated Title')).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('should enter edit mode on double click', async () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      // Should show text field
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Title')).toBeInTheDocument();
      });
    });

    it('should not enter edit mode on single click', () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      fireEvent.click(container, { detail: 1 });

      // Should not show text field
      expect(screen.queryByDisplayValue('Test Title')).not.toBeInTheDocument();
    });

    it('should autofocus text field when entering edit mode', async () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      await waitFor(() => {
        const input = screen.getByDisplayValue('Test Title') as HTMLInputElement;
        expect(input).toHaveFocus();
      });
    });
  });

  describe('Saving Changes', () => {
    it('should save changes on blur', async () => {
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original Text"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original Text');
      await user.clear(input);
      await user.type(input, 'New Text');
      fireEvent.blur(input);

      expect(mockOnTextChange).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.getByText('New Text')).toBeInTheDocument();
      });
    });

    it('should save changes on Enter key', async () => {
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original Text"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original Text');
      await user.clear(input);
      await user.type(input, 'New Text{Enter}');

      expect(mockOnTextChange).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.queryByDisplayValue('New Text')).not.toBeInTheDocument();
      });
    });

    it('should keep original value if new value is empty', async () => {
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original Text"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original Text');
      await user.clear(input);
      fireEvent.blur(input);

      expect(mockOnTextChange).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.getByText('Original Text')).toBeInTheDocument();
      });
    });

    it('should pass the correct event to onTextChange', async () => {
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original Text"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original Text');
      await user.clear(input);
      await user.type(input, 'New Text');
      fireEvent.blur(input);

      expect(mockOnTextChange).toHaveBeenCalledTimes(1);
      const event = mockOnTextChange.mock.calls[0][0];
      expect(event.target.value).toBe('New Text');
    });
  });

  describe('Text Alignment', () => {
    it('should default to left alignment', async () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Test Title') as HTMLInputElement;
      expect(input.style.textAlign).toBe('left');
    });

    it('should apply custom text alignment', async () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
          inputTextAlign="center"
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Test Title') as HTMLInputElement;
      expect(input.style.textAlign).toBe('center');
    });

    it('should support right alignment', async () => {
      render(
        <EditableText
          textValue="Test Title"
          onTextChange={mockOnTextChange}
          inputTextAlign="right"
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Test Title') as HTMLInputElement;
      expect(input.style.textAlign).toBe('right');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty initial value', () => {
      render(
        <EditableText
          textValue=""
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      expect(container).toBeInTheDocument();
    });

    it('should handle async onTextChange', async () => {
      const asyncOnTextChange = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original"
          onTextChange={asyncOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original');
      await user.clear(input);
      await user.type(input, 'New');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(asyncOnTextChange).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle rapid double clicks', async () => {
      render(
        <EditableText
          textValue="Test"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');

      // Multiple rapid double clicks
      triggerDoubleClick(container);
      triggerDoubleClick(container);
      triggerDoubleClick(container);

      // Should enter edit mode (without crashing)
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
      });
    });
  });

  describe('User Experience', () => {
    it('should exit edit mode and save when tabbing away', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <EditableText
            textValue="First"
            onTextChange={mockOnTextChange}
          />
          <button>Next Element</button>
        </div>
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('First');
      await user.clear(input);
      await user.type(input, 'Changed');
      await user.tab();

      expect(mockOnTextChange).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByText('Changed')).toBeInTheDocument();
      });
    });

    it('should show the updated value after successful save', async () => {
      const user = userEvent.setup();

      render(
        <EditableText
          textValue="Original"
          onTextChange={mockOnTextChange}
        />
      );

      const container = screen.getByTitle('Double-click to edit');
      triggerDoubleClick(container);

      const input = await screen.findByDisplayValue('Original');
      await user.clear(input);
      await user.type(input, 'Updated');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Updated')).toBeInTheDocument();
        expect(screen.queryByText('Original')).not.toBeInTheDocument();
      });
    });
  });
});
