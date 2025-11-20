import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UCWords, UpdateChapterQueryStringParameter } from '../utilities';

describe('utilities', () => {
  describe('UCWords', () => {
    it('should capitalize the first letter of each word', () => {
      const result = UCWords('hello world');
      expect(result).toBe('Hello World');
    });

    it('should handle single word strings', () => {
      const result = UCWords('hello');
      expect(result).toBe('Hello');
    });

    it('should handle already capitalized words', () => {
      const result = UCWords('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should handle mixed case words', () => {
      const result = UCWords('hELLo WoRLd');
      expect(result).toBe('HELLo WoRLd');
    });

    it('should handle empty string', () => {
      const result = UCWords('');
      expect(result).toBe('');
    });

    it('should handle string with multiple spaces', () => {
      const result = UCWords('hello  world');
      expect(result).toBe('Hello  World');
    });

    it('should handle strings with leading/trailing spaces', () => {
      const result = UCWords(' hello world ');
      expect(result).toBe(' Hello World ');
    });

    it('should handle single character words', () => {
      const result = UCWords('a b c');
      expect(result).toBe('A B C');
    });

    it('should handle strings with special characters', () => {
      const result = UCWords('hello-world test_case');
      expect(result).toBe('Hello-world Test_case');
    });

    it('should handle strings with numbers', () => {
      const result = UCWords('chapter 1 test');
      expect(result).toBe('Chapter 1 Test');
    });

    it('should handle unicode characters', () => {
      const result = UCWords('café résumé');
      expect(result).toBe('Café Résumé');
    });

    it('should handle strings with punctuation', () => {
      const result = UCWords('hello, world!');
      expect(result).toBe('Hello, World!');
    });

    it('should handle strings with tabs and newlines', () => {
      const result = UCWords('hello\tworld');
      expect(result).toBe('Hello\tworld');
    });

    it('should preserve word structure for hyphenated words', () => {
      const result = UCWords('well-known fact');
      expect(result).toBe('Well-known Fact');
    });
  });

  describe('UpdateChapterQueryStringParameter', () => {
    const originalWindow = global.window;

    beforeEach(() => {
      // Mock window.location and window.history
      delete (global as any).window;
      (global as any).window = {
        location: {
          protocol: 'https:',
          host: 'example.com',
          pathname: '/editor',
          search: '',
          href: 'https://example.com/editor',
        },
        history: {
          pushState: vi.fn(),
        },
      };
    });

    afterEach(() => {
      (global as any).window = originalWindow;
    });

    it('should update URL with chapter query parameter', () => {
      const chapterID = 'chapter-123';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=chapter-123' },
        '',
        'https://example.com/editor?chapter=chapter-123',
      );
    });

    it('should handle different chapter IDs', () => {
      const chapterID = 'abc-456-xyz';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=abc-456-xyz' },
        '',
        'https://example.com/editor?chapter=abc-456-xyz',
      );
    });

    it('should work with different protocols', () => {
      window.location.protocol = 'http:';
      const chapterID = 'chapter-1';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'http://example.com/editor?chapter=chapter-1' },
        '',
        'http://example.com/editor?chapter=chapter-1',
      );
    });

    it('should work with different hosts', () => {
      window.location.host = 'localhost:3000';
      const chapterID = 'chapter-2';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://localhost:3000/editor?chapter=chapter-2' },
        '',
        'https://localhost:3000/editor?chapter=chapter-2',
      );
    });

    it('should work with different pathnames', () => {
      window.location.pathname = '/stories/123/edit';
      const chapterID = 'chapter-3';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/stories/123/edit?chapter=chapter-3' },
        '',
        'https://example.com/stories/123/edit?chapter=chapter-3',
      );
    });

    it('should handle empty chapter ID', () => {
      const chapterID = '';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=' },
        '',
        'https://example.com/editor?chapter=',
      );
    });

    it('should handle chapter IDs with special characters', () => {
      const chapterID = 'chapter-123-special!';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=chapter-123-special!' },
        '',
        'https://example.com/editor?chapter=chapter-123-special!',
      );
    });

    it('should replace existing query parameters', () => {
      // Note: This function doesn't preserve existing query params
      window.location.search = '?existing=value';
      const chapterID = 'new-chapter';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=new-chapter' },
        '',
        'https://example.com/editor?chapter=new-chapter',
      );
    });

    it('should be called exactly once per invocation', () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');
      const chapterID = 'chapter-test';

      UpdateChapterQueryStringParameter(chapterID);

      expect(pushStateSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle root pathname', () => {
      window.location.pathname = '/';
      const chapterID = 'chapter-root';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/?chapter=chapter-root' },
        '',
        'https://example.com/?chapter=chapter-root',
      );
    });

    it('should handle pathname with trailing slash', () => {
      window.location.pathname = '/editor/';
      const chapterID = 'chapter-slash';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor/?chapter=chapter-slash' },
        '',
        'https://example.com/editor/?chapter=chapter-slash',
      );
    });

    it('should handle numeric chapter IDs', () => {
      const chapterID = '12345';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://example.com/editor?chapter=12345' },
        '',
        'https://example.com/editor?chapter=12345',
      );
    });

    it('should handle UUID-style chapter IDs', () => {
      const chapterID = '550e8400-e29b-41d4-a716-446655440000';
      UpdateChapterQueryStringParameter(chapterID);

      expect(window.history.pushState).toHaveBeenCalledWith(
        {
          path: 'https://example.com/editor?chapter=550e8400-e29b-41d4-a716-446655440000',
        },
        '',
        'https://example.com/editor?chapter=550e8400-e29b-41d4-a716-446655440000',
      );
    });
  });

  describe('Integration', () => {
    it('should work together for realistic use case', () => {
      // Capitalize a chapter title
      const chapterTitle = UCWords('chapter one: the beginning');
      expect(chapterTitle).toBe('Chapter One: The Beginning');

      // Mock window for URL update
      delete (global as any).window;
      (global as any).window = {
        location: {
          protocol: 'https:',
          host: 'app.example.com',
          pathname: '/story/editor',
          search: '',
        },
        history: {
          pushState: vi.fn(),
        },
      };

      // Update URL with chapter ID
      UpdateChapterQueryStringParameter('chapter-1');

      expect(window.history.pushState).toHaveBeenCalledWith(
        { path: 'https://app.example.com/story/editor?chapter=chapter-1' },
        '',
        'https://app.example.com/story/editor?chapter=chapter-1',
      );
    });
  });
});
