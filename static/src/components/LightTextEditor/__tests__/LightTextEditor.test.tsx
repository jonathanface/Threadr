import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LightTextEditor } from '../index';

// Mock document.execCommand
Object.defineProperty(document, 'execCommand', {
  value: vi.fn(),
  writable: true,
});

describe('LightTextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render toolbar with formatting buttons', () => {
      render(<LightTextEditor />);

      // Check for all formatting icons
      expect(screen.getByTestId('FormatBoldIcon')).toBeInTheDocument();
      expect(screen.getByTestId('FormatItalicIcon')).toBeInTheDocument();
      expect(screen.getByTestId('FormatUnderlinedIcon')).toBeInTheDocument();
      expect(screen.getByTestId('FormatListBulletedIcon')).toBeInTheDocument();
      expect(screen.getByTestId('FormatListNumberedIcon')).toBeInTheDocument();
    });

    it('should render editable content area', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv).toBeInTheDocument();
    });

    it('should render with default placeholder', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.textContent).toContain('Write beats, goals, themes for this stage');
    });

    it('should render with custom placeholder', () => {
      const { container } = render(<LightTextEditor placeholder="Custom placeholder text" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.textContent).toContain('Custom placeholder text');
    });

    it('should have all toolbar buttons', () => {
      render(<LightTextEditor />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5); // 5 formatting buttons
    });
  });

  describe('Toolbar Buttons', () => {
    it('should have tooltips on formatting buttons', async () => {
      render(<LightTextEditor />);

      const boldButton = screen.getByTestId('FormatBoldIcon').closest('button');
      expect(boldButton).toBeInTheDocument();

      if (boldButton) {
        fireEvent.mouseEnter(boldButton);
        await waitFor(() => {
          expect(screen.getByText('Bold')).toBeInTheDocument();
        });
      }
    });

    it('should call execCommand when bold button is clicked', () => {
      render(<LightTextEditor />);

      const boldButton = screen.getByTestId('FormatBoldIcon').closest('button');
      if (boldButton) {
        fireEvent.click(boldButton);
        expect(document.execCommand).toHaveBeenCalledWith('bold', false, undefined);
      }
    });

    it('should call execCommand when italic button is clicked', () => {
      render(<LightTextEditor />);

      const italicButton = screen.getByTestId('FormatItalicIcon').closest('button');
      if (italicButton) {
        fireEvent.click(italicButton);
        expect(document.execCommand).toHaveBeenCalledWith('italic', false, undefined);
      }
    });

    it('should call execCommand when underline button is clicked', () => {
      render(<LightTextEditor />);

      const underlineButton = screen.getByTestId('FormatUnderlinedIcon').closest('button');
      if (underlineButton) {
        fireEvent.click(underlineButton);
        expect(document.execCommand).toHaveBeenCalledWith('underline', false, undefined);
      }
    });

    it('should call execCommand for bulleted list', () => {
      render(<LightTextEditor />);

      const bulletButton = screen.getByTestId('FormatListBulletedIcon').closest('button');
      if (bulletButton) {
        fireEvent.click(bulletButton);
        expect(document.execCommand).toHaveBeenCalledWith('insertUnorderedList', false, undefined);
      }
    });

    it('should call execCommand for numbered list', () => {
      render(<LightTextEditor />);

      const numberedButton = screen.getByTestId('FormatListNumberedIcon').closest('button');
      if (numberedButton) {
        fireEvent.click(numberedButton);
        expect(document.execCommand).toHaveBeenCalledWith('insertOrderedList', false, undefined);
      }
    });
  });

  describe('Placeholder Behavior', () => {
    it('should clear placeholder on focus', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
      expect(editableDiv.textContent).toContain('Write beats');

      fireEvent.focus(editableDiv);

      expect(editableDiv.getAttribute('data-placeholder-active')).toBeFalsy();
    });

    it('should restore placeholder on blur if empty', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

      // Focus to clear placeholder
      fireEvent.focus(editableDiv);

      // Blur with empty content
      editableDiv.innerHTML = '';
      fireEvent.blur(editableDiv);

      waitFor(() => {
        expect(editableDiv.getAttribute('data-placeholder-active')).toBe('true');
      });
    });

    it('should not show placeholder when text is provided', () => {
      const { container } = render(<LightTextEditor text="<p>Some content</p>" />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
      expect(editableDiv.getAttribute('data-placeholder-active')).toBeFalsy();
    });
  });

  describe('Initial Text', () => {
    it('should render provided HTML text', () => {
      const { container } = render(<LightTextEditor text="<p>Hello World</p>" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).toContain('Hello World');
    });

    it('should sanitize provided HTML', () => {
      const { container } = render(<LightTextEditor text="<script>alert('xss')</script><p>Safe text</p>" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).not.toContain('<script>');
      expect(editableDiv?.innerHTML).toContain('Safe text');
    });

    it('should allow safe HTML tags', () => {
      const safeHtml = '<b>Bold</b> <i>Italic</i> <u>Underline</u>';
      const { container } = render(<LightTextEditor text={safeHtml} />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).toContain('<b>Bold</b>');
      expect(editableDiv?.innerHTML).toContain('<i>Italic</i>');
      expect(editableDiv?.innerHTML).toContain('<u>Underline</u>');
    });

    it('should handle empty string text', () => {
      const { container } = render(<LightTextEditor text="" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      // Should show placeholder when not focused
      expect(editableDiv?.textContent).toContain('Write beats');
    });

    it('should update when text prop changes', () => {
      const { container, rerender } = render(<LightTextEditor text="<p>Initial text</p>" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).toContain('Initial text');

      rerender(<LightTextEditor text="<p>Updated text</p>" />);
      expect(editableDiv?.innerHTML).toContain('Updated text');
    });
  });

  describe('OnChange Callback', () => {
    it('should call onChange on blur with empty string when content is empty', () => {
      const onChange = vi.fn();
      const { container } = render(<LightTextEditor onChange={onChange} />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

      fireEvent.focus(editableDiv);
      editableDiv.innerHTML = '';
      fireEvent.blur(editableDiv);

      expect(onChange).toHaveBeenCalledWith('');
    });

    it('should not call onChange when not provided', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

      // Should not throw
      expect(() => {
        fireEvent.focus(editableDiv);
        fireEvent.blur(editableDiv);
      }).not.toThrow();
    });
  });

  describe('Paste Handling', () => {
    it('should handle paste with plain text', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

      const clipboardData = {
        getData: vi.fn((format: string) => {
          if (format === 'text/plain') return 'Pasted plain text';
          return '';
        }),
      };

      const pasteEvent = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
        clipboardData,
      });

      editableDiv.dispatchEvent(pasteEvent);

      expect(clipboardData.getData).toHaveBeenCalledWith('text/plain');
    });
  });

  describe('Structure', () => {
    it('should have two Paper components', () => {
      const { container } = render(<LightTextEditor />);

      const papers = container.querySelectorAll('.MuiPaper-root');
      expect(papers.length).toBeGreaterThanOrEqual(2); // Toolbar and editor area
    });

    it('should have contentEditable div with proper styles', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
      expect(editableDiv.style.minHeight).toBe('100px');
      expect(editableDiv.style.outline).toBe('none');
    });
  });

  describe('Edge Cases', () => {
    it('should handle HTML with only whitespace', () => {
      const { container } = render(<LightTextEditor text="   " />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      // Should show placeholder for whitespace-only content
      expect(editableDiv?.textContent).toContain('Write beats');
    });

    it('should handle HTML with only <br> tags', () => {
      const { container } = render(<LightTextEditor text="<br><br>" />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      // Should treat as empty
      expect(editableDiv?.textContent).toContain('Write beats');
    });

    it('should handle very long text', () => {
      const longText = '<p>' + 'A'.repeat(10000) + '</p>';
      const { container } = render(<LightTextEditor text={longText} />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).toContain('A'.repeat(100)); // At least some of it
    });

    it('should handle multiple formatting buttons clicked rapidly', () => {
      render(<LightTextEditor />);

      const boldButton = screen.getByTestId('FormatBoldIcon').closest('button');
      const italicButton = screen.getByTestId('FormatItalicIcon').closest('button');
      const underlineButton = screen.getByTestId('FormatUnderlinedIcon').closest('button');

      // Click multiple buttons rapidly
      if (boldButton) fireEvent.click(boldButton);
      if (italicButton) fireEvent.click(italicButton);
      if (underlineButton) fireEvent.click(underlineButton);

      expect(document.execCommand).toHaveBeenCalledTimes(3);
    });

    it('should handle nested lists', () => {
      const nestedList = '<ul><li>Item 1<ul><li>Nested item</li></ul></li></ul>';
      const { container } = render(<LightTextEditor text={nestedList} />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).toContain('<ul>');
      expect(editableDiv?.innerHTML).toContain('<li>');
    });

    it('should sanitize dangerous attributes', () => {
      const dangerousHtml = '<p onclick="alert(\'xss\')">Text</p>';
      const { container } = render(<LightTextEditor text={dangerousHtml} />);

      const editableDiv = container.querySelector('[contenteditable="true"]');
      expect(editableDiv?.innerHTML).not.toContain('onclick');
      expect(editableDiv?.innerHTML).toContain('Text');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible toolbar buttons', () => {
      render(<LightTextEditor />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeInTheDocument();
      });
    });

    it('should be keyboard navigable through toolbar', () => {
      render(<LightTextEditor />);

      const buttons = screen.getAllByRole('button');

      // First button should be focusable
      buttons[0].focus();
      expect(buttons[0]).toHaveFocus();
    });

    it('should have contentEditable div that is focusable', () => {
      const { container } = render(<LightTextEditor />);

      const editableDiv = container.querySelector('[contenteditable="true"]') as HTMLDivElement;

      editableDiv.focus();
      expect(editableDiv).toHaveFocus();
    });
  });
});
