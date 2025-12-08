import { describe, it, expect } from 'vitest';
import {
  validateTitle,
  validateDescription,
  validateStoryForm,
  getRemainingChars,
  getCharCountColor,
} from '../validation';

describe('validation', () => {
  describe('validateTitle', () => {
    describe('Valid Titles', () => {
      it('should return null for valid title', () => {
        const result = validateTitle('My Story Title');
        expect(result).toBeNull();
      });

      it('should accept title with numbers', () => {
        const result = validateTitle('Story 123');
        expect(result).toBeNull();
      });

      it('should accept title with allowed special characters', () => {
        const result = validateTitle('Story + Title - Test = Cool');
        expect(result).toBeNull();
      });

      it('should accept title with dots, underscores, colons', () => {
        const result = validateTitle('Story_Title.Test:Version');
        expect(result).toBeNull();
      });

      it('should accept title with slashes and at signs', () => {
        const result = validateTitle('Story/Chapter @Author');
        expect(result).toBeNull();
      });

      it('should accept title with commas and quotes', () => {
        const result = validateTitle('Story, "The Best" Adventure\'s');
        expect(result).toBeNull();
      });

      it('should accept title at max length', () => {
        const maxLengthTitle = 'A'.repeat(256);
        const result = validateTitle(maxLengthTitle);
        expect(result).toBeNull();
      });

      it('should trim whitespace before validation', () => {
        const result = validateTitle('  Valid Title  ');
        expect(result).toBeNull();
      });
    });

    describe('Empty Titles', () => {
      it('should return error for empty string', () => {
        const result = validateTitle('');
        expect(result).toEqual({
          field: 'title',
          message: 'Story title is required',
        });
      });

      it('should return error for whitespace-only string', () => {
        const result = validateTitle('   ');
        expect(result).toEqual({
          field: 'title',
          message: 'Story title is required',
        });
      });

      it('should return error for tabs and newlines', () => {
        const result = validateTitle('\t\n');
        expect(result).toEqual({
          field: 'title',
          message: 'Story title is required',
        });
      });
    });

    describe('Title Length', () => {
      it('should return error for title exceeding max length', () => {
        const tooLongTitle = 'A'.repeat(257);
        const result = validateTitle(tooLongTitle);

        expect(result).toEqual({
          field: 'title',
          message: `Your title is 257 characters. Please shorten it to 256 or less.`,
          currentLength: 257,
          maxLength: 256,
        });
      });

      it('should return error with correct length after trimming', () => {
        const title = '  ' + 'A'.repeat(257) + '  ';
        const result = validateTitle(title);

        expect(result?.currentLength).toBe(257);
      });

      it('should accept title with exactly 256 characters', () => {
        const exactLengthTitle = 'A'.repeat(256);
        const result = validateTitle(exactLengthTitle);

        expect(result).toBeNull();
      });

      it('should return error for 257 characters', () => {
        const title = 'A'.repeat(257);
        const result = validateTitle(title);

        expect(result?.field).toBe('title');
        expect(result?.currentLength).toBe(257);
      });
    });

    describe('AWS Prefix', () => {
      it('should return error for title starting with "aws:"', () => {
        const result = validateTitle('aws:Story Title');

        expect(result).toEqual({
          field: 'title',
          message: 'Title cannot start with "aws:"',
        });
      });

      it('should return error for uppercase "AWS:"', () => {
        const result = validateTitle('AWS:Story Title');

        expect(result).toEqual({
          field: 'title',
          message: 'Title cannot start with "aws:"',
        });
      });

      it('should return error for mixed case "Aws:"', () => {
        const result = validateTitle('Aws:Story Title');

        expect(result).toEqual({
          field: 'title',
          message: 'Title cannot start with "aws:"',
        });
      });

      it('should accept "aws:" in middle of title', () => {
        const result = validateTitle('Story aws: Title');
        expect(result).toBeNull();
      });

      it('should accept "aws:" at end of title', () => {
        const result = validateTitle('Story Title aws:');
        expect(result).toBeNull();
      });

      it('should handle "aws:" with leading whitespace (trimmed)', () => {
        const result = validateTitle('  aws:Story');

        expect(result).toEqual({
          field: 'title',
          message: 'Title cannot start with "aws:"',
        });
      });
    });

    describe('Character Pattern', () => {
      it('should return error for title with disallowed characters', () => {
        const result = validateTitle('Story#Title');

        expect(result).toEqual({
          field: 'title',
          message: 'Title may only contain letters, numbers, spaces, and the following characters: + - = . _ : / @ , \' "',
        });
      });

      it('should return error for title with exclamation mark', () => {
        const result = validateTitle('Story Title!');

        expect(result?.field).toBe('title');
        expect(result?.message).toContain('may only contain');
      });

      it('should return error for title with question mark', () => {
        const result = validateTitle('Story Title?');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with ampersand', () => {
        const result = validateTitle('Story & Title');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with percent', () => {
        const result = validateTitle('Story 100%');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with parentheses', () => {
        const result = validateTitle('Story (Title)');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with brackets', () => {
        const result = validateTitle('Story [Title]');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with unicode characters', () => {
        const result = validateTitle('Story 测试');

        expect(result?.field).toBe('title');
      });

      it('should return error for title with emoji', () => {
        const result = validateTitle('Story 🎭');

        expect(result?.field).toBe('title');
      });
    });
  });

  describe('validateDescription', () => {
    describe('Valid Descriptions', () => {
      it('should return null for valid description', () => {
        const result = validateDescription('This is a test description');
        expect(result).toBeNull();
      });

      it('should accept description with multiple lines', () => {
        const result = validateDescription('Line 1\nLine 2\nLine 3');
        expect(result).toBeNull();
      });

      it('should accept description at max length', () => {
        const maxLengthDesc = 'A'.repeat(5000);
        const result = validateDescription(maxLengthDesc);
        expect(result).toBeNull();
      });

      it('should accept description with special characters', () => {
        const result = validateDescription('Description with !@#$%^&*()');
        expect(result).toBeNull();
      });

      it('should accept description with unicode', () => {
        const result = validateDescription('Description 测试 العربية 🎭');
        expect(result).toBeNull();
      });

      it('should trim whitespace before validation', () => {
        const result = validateDescription('  Valid Description  ');
        expect(result).toBeNull();
      });
    });

    describe('Empty Descriptions', () => {
      it('should return error for empty string', () => {
        const result = validateDescription('');

        expect(result).toEqual({
          field: 'description',
          message: 'A brief description is required',
        });
      });

      it('should return error for whitespace-only string', () => {
        const result = validateDescription('   ');

        expect(result).toEqual({
          field: 'description',
          message: 'A brief description is required',
        });
      });

      it('should return error for tabs and newlines only', () => {
        const result = validateDescription('\t\n\r');

        expect(result).toEqual({
          field: 'description',
          message: 'A brief description is required',
        });
      });
    });

    describe('Description Length', () => {
      it('should return error for description exceeding max length', () => {
        const tooLongDesc = 'A'.repeat(5001);
        const result = validateDescription(tooLongDesc);

        expect(result).toEqual({
          field: 'description',
          message: 'Description is too long (5001 characters). Maximum is 5000.',
          currentLength: 5001,
          maxLength: 5000,
        });
      });

      it('should accept description with exactly 5000 characters', () => {
        const exactLengthDesc = 'A'.repeat(5000);
        const result = validateDescription(exactLengthDesc);

        expect(result).toBeNull();
      });

      it('should return error for 5001 characters', () => {
        const desc = 'A'.repeat(5001);
        const result = validateDescription(desc);

        expect(result?.field).toBe('description');
        expect(result?.currentLength).toBe(5001);
      });

      it('should calculate length after trimming', () => {
        const desc = '  ' + 'A'.repeat(5001) + '  ';
        const result = validateDescription(desc);

        expect(result?.currentLength).toBe(5001);
      });
    });
  });

  describe('validateStoryForm', () => {
    it('should return empty array for valid title and description', () => {
      const errors = validateStoryForm('Valid Title', 'Valid description');

      expect(errors).toEqual([]);
    });

    it('should return title error only', () => {
      const errors = validateStoryForm('', 'Valid description');

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toBe('Story title is required');
    });

    it('should return description error only', () => {
      const errors = validateStoryForm('Valid Title', '');

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('description');
      expect(errors[0].message).toBe('A brief description is required');
    });

    it('should return both title and description errors', () => {
      const errors = validateStoryForm('', '');

      expect(errors).toHaveLength(2);
      expect(errors[0].field).toBe('title');
      expect(errors[1].field).toBe('description');
    });

    it('should return error for invalid title pattern', () => {
      const errors = validateStoryForm('Invalid#Title', 'Valid description');

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].message).toContain('may only contain');
    });

    it('should return error for too long title', () => {
      const longTitle = 'A'.repeat(257);
      const errors = validateStoryForm(longTitle, 'Valid description');

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('title');
      expect(errors[0].currentLength).toBe(257);
    });

    it('should return error for too long description', () => {
      const longDesc = 'A'.repeat(5001);
      const errors = validateStoryForm('Valid Title', longDesc);

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('description');
      expect(errors[0].currentLength).toBe(5001);
    });

    it('should return multiple errors when both are invalid', () => {
      const longTitle = 'A'.repeat(257);
      const longDesc = 'A'.repeat(5001);
      const errors = validateStoryForm(longTitle, longDesc);

      expect(errors).toHaveLength(2);
    });

    it('should return error for aws: prefix in title', () => {
      const errors = validateStoryForm('aws:Story', 'Valid description');

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('aws:');
    });
  });

  describe('getRemainingChars', () => {
    it('should return correct remaining characters', () => {
      const result = getRemainingChars('Hello', 10);
      expect(result).toBe(5);
    });

    it('should return max length when text is empty', () => {
      const result = getRemainingChars('', 100);
      expect(result).toBe(100);
    });

    it('should return 0 when text equals max length', () => {
      const result = getRemainingChars('Hello', 5);
      expect(result).toBe(0);
    });

    it('should return negative when text exceeds max length', () => {
      const result = getRemainingChars('Hello World', 5);
      expect(result).toBe(-6);
    });

    it('should handle large numbers', () => {
      const text = 'A'.repeat(1000);
      const result = getRemainingChars(text, 5000);
      expect(result).toBe(4000);
    });

    it('should handle unicode characters correctly', () => {
      const result = getRemainingChars('测试', 10);
      expect(result).toBe(8);
    });
  });

  describe('getCharCountColor', () => {
    describe('Error State (< 10%)', () => {
      it('should return "error" when remaining is less than 10%', () => {
        const result = getCharCountColor(9, 100);
        expect(result).toBe('error');
      });

      it('should return "error" at exactly 9.9%', () => {
        const result = getCharCountColor(9.9, 100);
        expect(result).toBe('error');
      });

      it('should return "error" when remaining is 0', () => {
        const result = getCharCountColor(0, 100);
        expect(result).toBe('error');
      });

      it('should return "error" when remaining is negative', () => {
        const result = getCharCountColor(-10, 100);
        expect(result).toBe('error');
      });
    });

    describe('Warning State (10% - 25%)', () => {
      it('should return "warning" at exactly 10%', () => {
        const result = getCharCountColor(10, 100);
        expect(result).toBe('warning');
      });

      it('should return "warning" at 15%', () => {
        const result = getCharCountColor(15, 100);
        expect(result).toBe('warning');
      });

      it('should return "warning" at 24.9%', () => {
        const result = getCharCountColor(24.9, 100);
        expect(result).toBe('warning');
      });

      it('should return "warning" when remaining is between 10% and 25%', () => {
        const result = getCharCountColor(20, 100);
        expect(result).toBe('warning');
      });
    });

    describe('Normal State (>= 25%)', () => {
      it('should return "text.secondary" at exactly 25%', () => {
        const result = getCharCountColor(25, 100);
        expect(result).toBe('text.secondary');
      });

      it('should return "text.secondary" at 50%', () => {
        const result = getCharCountColor(50, 100);
        expect(result).toBe('text.secondary');
      });

      it('should return "text.secondary" at 75%', () => {
        const result = getCharCountColor(75, 100);
        expect(result).toBe('text.secondary');
      });

      it('should return "text.secondary" at 100%', () => {
        const result = getCharCountColor(100, 100);
        expect(result).toBe('text.secondary');
      });

      it('should return "text.secondary" when remaining exceeds max', () => {
        const result = getCharCountColor(150, 100);
        expect(result).toBe('text.secondary');
      });
    });

    describe('Edge Cases', () => {
      it('should handle very large max length', () => {
        const result = getCharCountColor(100, 10000);
        expect(result).toBe('error'); // 1%
      });

      it('should handle decimal percentages correctly', () => {
        const result = getCharCountColor(25.1, 100);
        expect(result).toBe('text.secondary');
      });

      it('should handle small maxLength values', () => {
        const result = getCharCountColor(1, 10);
        expect(result).toBe('warning'); // 1/10 = 10%, which is in warning range
      });

      it('should handle zero maxLength (division by zero)', () => {
        const result = getCharCountColor(10, 0);
        // Infinity percentage
        expect(result).toBe('text.secondary');
      });
    });
  });
});
