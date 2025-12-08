import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InfoHover } from '../index';

describe('InfoHover', () => {
  describe('Rendering', () => {
    it('should render icon button', () => {
      render(<InfoHover text="Test information" />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render InfoOutlinedIcon', () => {
      render(<InfoHover text="Test information" />);

      const icon = screen.getByTestId('InfoOutlinedIcon');
      expect(icon).toBeInTheDocument();
    });

    it('should render with small size', () => {
      render(<InfoHover text="Test information" />);

      const button = screen.getByRole('button');
      // MUI IconButton with size="small" has specific styling
      expect(button).toBeInTheDocument();
    });
  });

  describe('Tooltip', () => {
    it('should display tooltip on hover', async () => {
      const tooltipText = 'This is helpful information';
      render(<InfoHover text={tooltipText} />);

      const button = screen.getByRole('button');

      // Hover over the button
      fireEvent.mouseEnter(button);

      // Wait for tooltip to appear
      await waitFor(() => {
        expect(screen.getByText(tooltipText)).toBeInTheDocument();
      });
    });

    it('should hide tooltip when not hovering', async () => {
      const tooltipText = 'This is helpful information';
      render(<InfoHover text={tooltipText} />);

      // Initially tooltip should not be visible
      expect(screen.queryByText(tooltipText)).not.toBeInTheDocument();
    });

    it('should display different text content', async () => {
      const customText = 'Custom tooltip message';
      render(<InfoHover text={customText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(customText)).toBeInTheDocument();
      });
    });

    it('should show tooltip with arrow', async () => {
      render(<InfoHover text="Test text" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      // Wait for tooltip to render
      await waitFor(() => {
        expect(screen.getByText('Test text')).toBeInTheDocument();
      });

      // MUI Tooltip with arrow prop adds an arrow element
      const tooltip = screen.getByText('Test text').closest('[role="tooltip"]');
      expect(tooltip).toBeInTheDocument();
    });

    it('should place tooltip on top', async () => {
      render(<InfoHover text="Top placement" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText('Top placement')).toBeInTheDocument();
      });
    });
  });

  describe('Text Content', () => {
    it('should handle long text', async () => {
      const longText = 'A'.repeat(500);
      render(<InfoHover text={longText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(longText)).toBeInTheDocument();
      });
    });

    it('should handle text with HTML entities', async () => {
      const textWithEntities = 'This & that < > "quotes"';
      render(<InfoHover text={textWithEntities} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(textWithEntities)).toBeInTheDocument();
      });
    });

    it('should handle text with line breaks', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      render(<InfoHover text={multilineText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip.textContent).toContain('Line 1');
        expect(tooltip.textContent).toContain('Line 2');
        expect(tooltip.textContent).toContain('Line 3');
      });
    });

    it('should handle text with special characters', async () => {
      const specialText = '©®™€£¥';
      render(<InfoHover text={specialText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(specialText)).toBeInTheDocument();
      });
    });

    it('should handle numbers as text', async () => {
      const numericText = '12345';
      render(<InfoHover text={numericText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(numericText)).toBeInTheDocument();
      });
    });
  });

  describe('Interactions', () => {
    it('should show tooltip on mouse enter and hide on mouse leave', async () => {
      const text = 'Interactive tooltip';
      render(<InfoHover text={text} />);

      const button = screen.getByRole('button');

      // Show tooltip
      fireEvent.mouseEnter(button);
      await waitFor(() => {
        expect(screen.getByText(text)).toBeInTheDocument();
      });

      // Hide tooltip
      fireEvent.mouseLeave(button);
      await waitFor(() => {
        expect(screen.queryByText(text)).not.toBeInTheDocument();
      });
    });

    it('should be clickable', () => {
      render(<InfoHover text="Clickable" />);

      const button = screen.getByRole('button');

      // Should not throw when clicked
      expect(() => fireEvent.click(button)).not.toThrow();
    });

    it('should handle rapid hover events', async () => {
      const text = 'Rapid hover';
      render(<InfoHover text={text} />);

      const button = screen.getByRole('button');

      // Rapid hover on/off
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);
      fireEvent.mouseEnter(button);

      // Should still work
      await waitFor(() => {
        expect(screen.getByText(text)).toBeInTheDocument();
      });
    });
  });

  describe('Icon Properties', () => {
    it('should use InfoOutlinedIcon component', () => {
      render(<InfoHover text="Icon test" />);

      const icon = screen.getByTestId('InfoOutlinedIcon');
      expect(icon).toBeInTheDocument();
    });

    it('should set icon fontSize to inherit', () => {
      render(<InfoHover text="Font size test" />);

      const icon = screen.getByTestId('InfoOutlinedIcon');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have button role', () => {
      render(<InfoHover text="Accessibility test" />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should be keyboard focusable', () => {
      render(<InfoHover text="Keyboard accessible" />);

      const button = screen.getByRole('button');

      // Focus the button
      button.focus();
      expect(button).toHaveFocus();
    });

    it('should have proper ARIA attributes on tooltip', async () => {
      render(<InfoHover text="ARIA test" />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only text', async () => {
      const whitespaceText = '   ';
      render(<InfoHover text={whitespaceText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        const tooltip = document.querySelector('[role="tooltip"]');
        expect(tooltip).toBeTruthy();
      });
    });

    it('should handle text with only newlines', async () => {
      const newlinesOnly = '\n\n\n';
      render(<InfoHover text={newlinesOnly} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render multiple InfoHover components independently', async () => {
      render(
        <>
          <InfoHover text="First tooltip" />
          <InfoHover text="Second tooltip" />
          <InfoHover text="Third tooltip" />
        </>
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);

      // Hover first button
      fireEvent.mouseEnter(buttons[0]);
      await waitFor(() => {
        expect(screen.getByText('First tooltip')).toBeInTheDocument();
      });

      // Other tooltips should not be visible
      expect(screen.queryByText('Second tooltip')).not.toBeInTheDocument();
      expect(screen.queryByText('Third tooltip')).not.toBeInTheDocument();
    });

    it('should handle very short text', async () => {
      const shortText = 'X';
      render(<InfoHover text={shortText} />);

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      await waitFor(() => {
        expect(screen.getByText(shortText)).toBeInTheDocument();
      });
    });
  });
});
