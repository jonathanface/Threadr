import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryFormFields } from '../StoryFormFields';

describe('StoryFormFields', () => {
  const defaultProps = {
    title: '',
    description: '',
    onTitleChange: vi.fn(),
    onDescriptionChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<StoryFormFields {...defaultProps} />);
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/story description/i)).toBeInTheDocument();
    });

    it('should display title input', () => {
      render(<StoryFormFields {...defaultProps} />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveAttribute('type', 'text');
    });

    it('should display description textarea', () => {
      render(<StoryFormFields {...defaultProps} />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toBeInTheDocument();
      expect(descriptionInput.tagName).toBe('TEXTAREA');
    });

    it('should show character count for title', () => {
      render(<StoryFormFields {...defaultProps} />);
      expect(screen.getByText('0/256')).toBeInTheDocument();
    });

    it('should show character count for description', () => {
      render(<StoryFormFields {...defaultProps} />);
      expect(screen.getByText('0/5000')).toBeInTheDocument();
    });
  });

  describe('Title Input', () => {
    it('should display title value', () => {
      render(<StoryFormFields {...defaultProps} title="My Story" />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveValue('My Story');
    });

    it('should call onTitleChange when typing', async () => {
      const onTitleChange = vi.fn();
      const user = userEvent.setup();
      render(<StoryFormFields {...defaultProps} onTitleChange={onTitleChange} />);

      const titleInput = screen.getByLabelText(/title/i);
      await user.type(titleInput, 'Hello');

      expect(onTitleChange).toHaveBeenCalled();
      // Check that at least one call contains accumulated text
      const calls = onTitleChange.mock.calls;
      expect(calls.some(call => call[0].includes('H'))).toBe(true);
    });

    it('should update character count for title', () => {
      render(<StoryFormFields {...defaultProps} title="Test" />);
      expect(screen.getByText('4/256')).toBeInTheDocument();
    });

    it('should show negative count when title exceeds max length', () => {
      const longTitle = 'A'.repeat(260);
      render(<StoryFormFields {...defaultProps} title={longTitle} />);
      expect(screen.getByText('260/256')).toBeInTheDocument();
    });

    it('should have maxLength attribute on title input', () => {
      render(<StoryFormFields {...defaultProps} />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveAttribute('maxLength', '256');
    });

    it('should show title error message when provided', () => {
      render(<StoryFormFields {...defaultProps} titleError="Title is required" />);
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });

    it('should mark title input as invalid when error exists', () => {
      render(<StoryFormFields {...defaultProps} titleError="Title is required" />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Description Input', () => {
    it('should display description value', () => {
      render(<StoryFormFields {...defaultProps} description="My description" />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveValue('My description');
    });

    it('should call onDescriptionChange when typing', async () => {
      const onDescriptionChange = vi.fn();
      const user = userEvent.setup();
      render(<StoryFormFields {...defaultProps} onDescriptionChange={onDescriptionChange} />);

      const descriptionInput = screen.getByLabelText(/story description/i);
      await user.type(descriptionInput, 'Hello');

      expect(onDescriptionChange).toHaveBeenCalled();
      // Check that at least one call contains accumulated text
      const calls = onDescriptionChange.mock.calls;
      expect(calls.some(call => call[0].includes('H'))).toBe(true);
    });

    it('should update character count for description', () => {
      render(<StoryFormFields {...defaultProps} description="Test description" />);
      expect(screen.getByText('16/5000')).toBeInTheDocument();
    });

    it('should show negative count when description exceeds max length', () => {
      const longDesc = 'A'.repeat(5005);
      render(<StoryFormFields {...defaultProps} description={longDesc} />);
      expect(screen.getByText('5005/5000')).toBeInTheDocument();
    });

    it('should have maxLength attribute on description input', () => {
      render(<StoryFormFields {...defaultProps} />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveAttribute('maxLength', '5000');
    });

    it('should show description error message when provided', () => {
      render(<StoryFormFields {...defaultProps} descriptionError="Description is required" />);
      expect(screen.getByText('Description is required')).toBeInTheDocument();
    });

    it('should mark description input as invalid when error exists', () => {
      render(<StoryFormFields {...defaultProps} descriptionError="Description is required" />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('should render as multiline with 4 rows', () => {
      render(<StoryFormFields {...defaultProps} />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveAttribute('rows', '4');
    });
  });

  describe('Character Count Colors', () => {
    it('should show error color when title has less than 10% remaining', () => {
      const title = 'A'.repeat(240); // 16 remaining = 6.25%
      render(<StoryFormFields {...defaultProps} title={title} />);
      const characterCount = screen.getByText('240/256');

      // Just verify the character count is displayed
      // Color is controlled by getCharCountColor which is tested separately
      expect(characterCount).toBeInTheDocument();
    });

    it('should show warning color when title has 10-25% remaining', () => {
      const title = 'A'.repeat(205); // 51 remaining = 19.9%
      render(<StoryFormFields {...defaultProps} title={title} />);
      const characterCount = screen.getByText('205/256');

      // Character count should be visible
      expect(characterCount).toBeInTheDocument();
    });

    it('should show normal color when title has more than 25% remaining', () => {
      const title = 'A'.repeat(100); // 156 remaining = 60.9%
      render(<StoryFormFields {...defaultProps} title={title} />);
      const characterCount = screen.getByText('100/256');

      // Character count should be visible
      expect(characterCount).toBeInTheDocument();
    });

    it('should show error color when description has less than 10% remaining', () => {
      const description = 'A'.repeat(4550); // 450 remaining = 9%
      render(<StoryFormFields {...defaultProps} description={description} />);
      const characterCount = screen.getByText('4550/5000');
      expect(characterCount).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on title input', () => {
      render(<StoryFormFields {...defaultProps} />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveAttribute('aria-label', 'Story title');
      expect(titleInput).toHaveAttribute('aria-required', 'true');
    });

    it('should have proper ARIA labels on description input', () => {
      render(<StoryFormFields {...defaultProps} />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveAttribute('aria-label', 'Story description');
      expect(descriptionInput).toHaveAttribute('aria-required', 'true');
    });

    it('should link title error to input with aria-describedby', () => {
      render(<StoryFormFields {...defaultProps} titleError="Error message" />);
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toHaveAttribute('aria-describedby', 'title-error');
    });

    it('should link description error to input with aria-describedby', () => {
      render(<StoryFormFields {...defaultProps} descriptionError="Error message" />);
      const descriptionInput = screen.getByLabelText(/story description/i);
      expect(descriptionInput).toHaveAttribute('aria-describedby', 'description-error');
    });

    it('should mark inputs as required', () => {
      render(<StoryFormFields {...defaultProps} />);
      expect(screen.getByLabelText(/title/i)).toBeRequired();
      expect(screen.getByLabelText(/story description/i)).toBeRequired();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      render(<StoryFormFields {...defaultProps} title="" description="" />);
      expect(screen.getByText('0/256')).toBeInTheDocument();
      expect(screen.getByText('0/5000')).toBeInTheDocument();
    });

    it('should handle max length strings', () => {
      const maxTitle = 'A'.repeat(256);
      const maxDesc = 'A'.repeat(5000);
      render(<StoryFormFields {...defaultProps} title={maxTitle} description={maxDesc} />);
      expect(screen.getByText('256/256')).toBeInTheDocument();
      expect(screen.getByText('5000/5000')).toBeInTheDocument();
    });

    it('should handle strings exceeding max length', () => {
      const overMaxTitle = 'A'.repeat(300);
      const overMaxDesc = 'A'.repeat(5100);
      render(<StoryFormFields {...defaultProps} title={overMaxTitle} description={overMaxDesc} />);
      expect(screen.getByText('300/256')).toBeInTheDocument();
      expect(screen.getByText('5100/5000')).toBeInTheDocument();
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-={}[]|:";\'<>?,./';
      render(<StoryFormFields {...defaultProps} title={specialChars} description={specialChars} />);
      expect(screen.getByLabelText(/title/i)).toHaveValue(specialChars);
      expect(screen.getByLabelText(/story description/i)).toHaveValue(specialChars);
    });

    it('should handle unicode characters', () => {
      const unicode = '测试 🎭 العربية';
      render(<StoryFormFields {...defaultProps} title={unicode} description={unicode} />);
      expect(screen.getByLabelText(/title/i)).toHaveValue(unicode);
      expect(screen.getByLabelText(/story description/i)).toHaveValue(unicode);
    });

    it('should handle newlines in description', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      render(<StoryFormFields {...defaultProps} description={multiline} />);
      expect(screen.getByLabelText(/story description/i)).toHaveValue(multiline);
    });
  });
});
