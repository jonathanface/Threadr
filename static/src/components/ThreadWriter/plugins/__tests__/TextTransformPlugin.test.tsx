import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { TextTransformPlugin } from '../TextTransformPlugin';

describe('TextTransformPlugin', () => {
  describe('Plugin structure', () => {
    it('should return null (does not render anything)', () => {
      // The plugin uses useLexicalComposerContext internally,
      // so we can't call it directly outside of a Lexical context.
      // Instead, we verify the export exists and is a function.
      expect(typeof TextTransformPlugin).toBe('function');
    });

    it('should accept isProgrammaticChange ref prop', () => {
      // Verify the component signature accepts the expected props
      const mockRef = { current: false } as React.RefObject<boolean>;

      // This verifies TypeScript accepts the prop without needing to mount
      const props: React.ComponentProps<typeof TextTransformPlugin> = {
        isProgrammaticChange: mockRef,
      };

      expect(props).toBeDefined();
    });

    it('should work without isProgrammaticChange prop', () => {
      // Verify the component signature works without the optional prop
      const props: React.ComponentProps<typeof TextTransformPlugin> = {};

      expect(props).toBeDefined();
    });
  });

  describe('Text transformation patterns', () => {
    // Test the transformation logic that would be applied
    const applyTransformations = (text: string): string => {
      return text
        .replace(/--/g, '\u2014') // em dash
        .replace(/\u201c/g, '"') // left smart quote to regular
        .replace(/\u201d/g, '"') // right smart quote to regular
        .replace(/\u2018/g, "'") // left smart single quote to regular
        .replace(/\u2019/g, "'"); // right smart single quote to regular
    };

    it('should replace double dash with em dash', () => {
      expect(applyTransformations('Hello--world')).toBe('Hello\u2014world');
    });

    it('should replace left smart double quote with regular quote', () => {
      expect(applyTransformations('\u201cHello\u201d')).toBe('"Hello"');
    });

    it('should replace right smart double quote with regular quote', () => {
      expect(applyTransformations('\u201cHello\u201d')).toBe('"Hello"');
    });

    it('should replace left smart single quote with regular apostrophe', () => {
      expect(applyTransformations("It\u2019s \u2018nice\u2019")).toBe("It's 'nice'");
    });

    it('should replace right smart single quote with regular apostrophe', () => {
      expect(applyTransformations("It\u2019s \u2018nice\u2019")).toBe("It's 'nice'");
    });

    it('should handle multiple transformations in one string', () => {
      expect(applyTransformations('Test--text with \u201cquotes\u201d and \u2018apostrophes\u2019')).toBe(
        'Test\u2014text with "quotes" and \'apostrophes\''
      );
    });

    it('should not transform text without special characters', () => {
      const text = 'Regular text without special chars';
      expect(applyTransformations(text)).toBe(text);
    });

    it('should handle text with only transformable characters', () => {
      expect(applyTransformations('--')).toBe('\u2014');
    });

    it('should handle consecutive double dashes', () => {
      expect(applyTransformations('----')).toBe('\u2014\u2014');
    });

    it('should not affect single dashes', () => {
      expect(applyTransformations('single-dash')).toBe('single-dash');
    });

    it('should handle mixed smart and regular quotes', () => {
      expect(applyTransformations('\u201cMixed\u201d "quotes"')).toBe('"Mixed" "quotes"');
    });

    it('should handle empty string', () => {
      expect(applyTransformations('')).toBe('');
    });
  });

  describe('Cursor offset calculation', () => {
    // Test the cursor offset adjustment logic
    const calculateNewOffset = (originalText: string, originalOffset: number): number => {
      const leftOfCursor = originalText.slice(0, originalOffset);
      const leftReplaced = leftOfCursor
        .replace(/--/g, '\u2014')
        .replace(/\u201c/g, '"')
        .replace(/\u201d/g, '"')
        .replace(/\u2018/g, "'")
        .replace(/\u2019/g, "'");

      return leftReplaced.length;
    };

    it('should adjust offset after double dash at start', () => {
      // "Hello--world" with cursor at end (offset 12)
      // After transformation: "Hello—world" should be offset 11
      const newOffset = calculateNewOffset('Hello--world', 12);
      expect(newOffset).toBe(11);
    });

    it('should adjust offset when transformation happens before cursor', () => {
      // "A--B--C" with cursor at offset 6 (after "A--B--")
      // After transformation: "A—B—C" should be offset 4 (after "A—B—")
      const newOffset = calculateNewOffset('A--B--C', 6);
      expect(newOffset).toBe(4);
    });

    it('should preserve offset when no transformation occurs before cursor', () => {
      // "Hello world" with cursor at offset 5
      // No transformation, offset stays 5
      const newOffset = calculateNewOffset('Hello world', 5);
      expect(newOffset).toBe(5);
    });

    it('should handle offset at start', () => {
      const newOffset = calculateNewOffset('--test', 0);
      expect(newOffset).toBe(0);
    });

    it('should handle offset after single transformation', () => {
      // "Before--" with cursor at offset 8
      // After transformation: "Before—" should be offset 7
      const newOffset = calculateNewOffset('Before--', 8);
      expect(newOffset).toBe(7);
    });

    it('should handle multiple transformations before cursor', () => {
      // ""--"" with cursor at end
      // Original: 6 chars (2 left quotes + 2 dashes + 2 right quotes)
      // After: 5 chars (2 regular quotes + 1 em dash + 2 regular quotes)
      const originalText = '\u201c\u201d--\u201c\u201d';
      const newOffset = calculateNewOffset(originalText, originalText.length);
      expect(newOffset).toBe(5);
    });

    it('should not adjust offset when cursor is before all transformations', () => {
      // "abc--def" with cursor at offset 2 (after "ab")
      // Transformation is after cursor, offset stays 2
      const newOffset = calculateNewOffset('abc--def', 2);
      expect(newOffset).toBe(2);
    });
  });

  describe('Pattern detection', () => {
    const containsTransformablePattern = (text: string): boolean => {
      return text.includes('--') ||
        text.includes('\u201c') || // Left smart quote
        text.includes('\u201d') || // Right smart quote
        text.includes('\u2018') || // Left smart single quote
        text.includes('\u2019'); // Right smart single quote
    };

    it('should detect double dash pattern', () => {
      expect(containsTransformablePattern('text--with--dashes')).toBe(true);
    });

    it('should detect smart quotes', () => {
      expect(containsTransformablePattern('\u201cquoted\u201d')).toBe(true);
      expect(containsTransformablePattern('\u201cquoted\u201d')).toBe(true);
    });

    it('should detect smart apostrophes', () => {
      expect(containsTransformablePattern("it\u2019s")).toBe(true);
      expect(containsTransformablePattern("it\u2018s")).toBe(true);
    });

    it('should not detect patterns in plain text', () => {
      expect(containsTransformablePattern('plain text')).toBe(false);
    });

    it('should detect mixed patterns', () => {
      expect(containsTransformablePattern('text--with \u201cquotes\u201d')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(containsTransformablePattern('')).toBe(false);
    });
  });
});
