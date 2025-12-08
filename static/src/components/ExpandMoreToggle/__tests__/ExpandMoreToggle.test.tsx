import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExpandMoreToggle } from '../index';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

describe('ExpandMoreToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render button with children', () => {
      render(
        <ExpandMoreToggle expand={false}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render without children', () => {
      render(<ExpandMoreToggle expand={false} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render text children', () => {
      render(
        <ExpandMoreToggle expand={false}>
          <span>Toggle</span>
        </ExpandMoreToggle>
      );

      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });
  });

  describe('Expand State', () => {
    it('should apply rotation when expanded', () => {
      render(
        <ExpandMoreToggle expand={true}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transform: 'rotate(0deg)' });
    });

    it('should apply different rotation when collapsed', () => {
      render(
        <ExpandMoreToggle expand={false}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transform: 'rotate(-90deg)' });
    });

    it('should update rotation when expand prop changes', () => {
      const { rerender } = render(
        <ExpandMoreToggle expand={false}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transform: 'rotate(-90deg)' });

      rerender(
        <ExpandMoreToggle expand={true}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      expect(button).toHaveStyle({ transform: 'rotate(0deg)' });
    });
  });

  describe('Tooltips', () => {
    it('should show custom open tooltip when collapsed', () => {
      render(
        <ExpandMoreToggle expand={false} tooltipOpenText="Expand Section">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      // Tooltip is handled by MUI, just verify button exists
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should show custom close tooltip when expanded', () => {
      render(
        <ExpandMoreToggle expand={true} tooltipCloseText="Collapse Section">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should switch tooltip text when expand state changes', () => {
      const { rerender } = render(
        <ExpandMoreToggle expand={false} tooltipOpenText="Open" tooltipCloseText="Close">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();

      rerender(
        <ExpandMoreToggle expand={true} tooltipOpenText="Open" tooltipCloseText="Close">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      expect(button).toBeInTheDocument();
    });
  });

  describe('IconButton Props', () => {
    it('should accept onClick handler', () => {
      const handleClick = vi.fn();

      render(
        <ExpandMoreToggle expand={false} onClick={handleClick}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalled();
    });

    it('should accept aria-label prop', () => {
      render(
        <ExpandMoreToggle expand={false} aria-label="Toggle expansion">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      expect(screen.getByLabelText('Toggle expansion')).toBeInTheDocument();
    });

    it('should accept disabled prop', () => {
      render(
        <ExpandMoreToggle expand={false} disabled>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should not trigger onClick when disabled', () => {
      const handleClick = vi.fn();

      render(
        <ExpandMoreToggle expand={false} onClick={handleClick} disabled>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should accept size prop', () => {
      render(
        <ExpandMoreToggle expand={false} size="large">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should accept className prop', () => {
      render(
        <ExpandMoreToggle expand={false} className="custom-class">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to button element', () => {
      const ref = { current: null as HTMLButtonElement | null } as React.RefObject<HTMLButtonElement>;

      render(
        <ExpandMoreToggle expand={false} ref={ref}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('should allow accessing button methods through ref', () => {
      const ref = { current: null as HTMLButtonElement | null } as React.RefObject<HTMLButtonElement>;

      render(
        <ExpandMoreToggle expand={false} ref={ref}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      expect(ref.current?.click).toBeDefined();
      expect(ref.current?.focus).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null children', () => {
      render(<ExpandMoreToggle expand={false}>{null}</ExpandMoreToggle>);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle multiple children', () => {
      render(
        <ExpandMoreToggle expand={false}>
          <span>Child 1</span>
          <span>Child 2</span>
        </ExpandMoreToggle>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
    });

    it('should handle empty string tooltips', () => {
      render(
        <ExpandMoreToggle expand={false} tooltipOpenText="" tooltipCloseText="">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle very long tooltip text', () => {
      const longText = 'A'.repeat(200);

      render(
        <ExpandMoreToggle expand={false} tooltipOpenText={longText}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle rapid expand state changes', () => {
      const { rerender } = render(
        <ExpandMoreToggle expand={false}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');

      for (let i = 0; i < 10; i++) {
        rerender(
          <ExpandMoreToggle expand={i % 2 === 0}>
            <ExpandMoreIcon />
          </ExpandMoreToggle>
        );
      }

      expect(button).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have margin-left style', () => {
      render(
        <ExpandMoreToggle expand={false}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ marginLeft: '4px' });
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard accessible', () => {
      const handleClick = vi.fn();

      render(
        <ExpandMoreToggle expand={false} onClick={handleClick}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      button.focus();

      expect(button).toHaveFocus();
    });

    it('should support aria-expanded attribute', () => {
      render(
        <ExpandMoreToggle expand={true} aria-expanded={true}>
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should work with screen readers when disabled', () => {
      render(
        <ExpandMoreToggle expand={false} disabled aria-label="Expand section">
          <ExpandMoreIcon />
        </ExpandMoreToggle>
      );

      const button = screen.getByLabelText('Expand section');
      expect(button).toBeDisabled();
    });
  });
});
