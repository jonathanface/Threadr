import { describe, it, expect } from 'vitest';
import { buildStoryFormData } from '../formDataBuilder';

describe('formDataBuilder', () => {
  describe('buildStoryFormData', () => {
    describe('String Values', () => {
      it('should append string values to FormData', () => {
        const data = {
          title: 'Test Story',
          description: 'Test Description',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('description')).toBe('Test Description');
      });

      it('should append story_id', () => {
        const data = {
          story_id: 'story-123',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('story_id')).toBe('story-123');
      });

      it('should append series_id', () => {
        const data = {
          series_id: 'series-456',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_id')).toBe('series-456');
      });

      it('should append series_name', () => {
        const data = {
          series_name: 'Test Series',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_name')).toBe('Test Series');
      });

      it('should append series_title', () => {
        const data = {
          series_title: 'Series Title',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_title')).toBe('Series Title');
      });

      it('should append image_url', () => {
        const data = {
          image_url: 'https://example.com/image.jpg',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('image_url')).toBe('https://example.com/image.jpg');
      });

      it('should handle empty strings', () => {
        const data = {
          title: '',
          description: '',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('');
        expect(formData.get('description')).toBe('');
      });

      it('should handle strings with special characters', () => {
        const data = {
          title: 'Test & Story <script>alert("xss")</script>',
          description: 'Line 1\nLine 2\nLine 3',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test & Story <script>alert("xss")</script>');
        expect(formData.get('description')).toBe('Line 1\nLine 2\nLine 3');
      });

      it('should handle very long strings', () => {
        const longString = 'A'.repeat(10000);
        const data = {
          description: longString,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('description')).toBe(longString);
      });
    });

    describe('Number Values', () => {
      it('should convert number to string and append', () => {
        const data = {
          series_place: 5,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_place')).toBe('5');
      });

      it('should handle zero', () => {
        const data = {
          series_place: 0,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_place')).toBe('0');
      });

      it('should handle negative numbers', () => {
        const data = {
          series_place: -1,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_place')).toBe('-1');
      });

      it('should handle large numbers', () => {
        const data = {
          series_place: 999999,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_place')).toBe('999999');
      });

      it('should handle decimal numbers', () => {
        const data = {
          series_place: 3.14,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('series_place')).toBe('3.14');
      });
    });

    describe('File Values', () => {
      it('should append File with key "file"', () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        const data = {
          image: file,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('file')).toBe(file);
      });

      it('should append File regardless of original key name', () => {
        const file = new File(['content'], 'test.png', { type: 'image/png' });
        const data = {
          image: file,
        };

        const formData = buildStoryFormData(data);

        // File is always appended with key "file", not "image"
        expect(formData.get('file')).toBe(file);
        expect(formData.get('image')).toBeNull();
      });

      it('should handle File with different types', () => {
        const pdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
        const data = {
          image: pdfFile,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('file')).toBe(pdfFile);
      });

      it('should handle empty File', () => {
        const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' });
        const data = {
          image: emptyFile,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('file')).toBe(emptyFile);
      });

      it('should handle File with large content', () => {
        const largeContent = new Uint8Array(1024 * 1024); // 1MB
        const largeFile = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
        const data = {
          image: largeFile,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('file')).toBe(largeFile);
      });
    });

    describe('Undefined Values', () => {
      it('should skip undefined values', () => {
        const data = {
          title: 'Test Story',
          description: undefined,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('description')).toBeNull();
      });

      it('should skip all undefined values', () => {
        const data = {
          story_id: undefined,
          title: undefined,
          description: undefined,
          series_id: undefined,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('story_id')).toBeNull();
        expect(formData.get('title')).toBeNull();
        expect(formData.get('description')).toBeNull();
        expect(formData.get('series_id')).toBeNull();
      });
    });

    describe('Mixed Values', () => {
      it('should handle combination of strings, numbers, and files', () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        const data = {
          story_id: 'story-123',
          title: 'Test Story',
          description: 'Test Description',
          series_id: 'series-456',
          series_place: 3,
          image: file,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('story_id')).toBe('story-123');
        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('description')).toBe('Test Description');
        expect(formData.get('series_id')).toBe('series-456');
        expect(formData.get('series_place')).toBe('3');
        expect(formData.get('file')).toBe(file);
      });

      it('should handle mix with undefined values', () => {
        const data = {
          title: 'Test Story',
          description: undefined,
          series_place: 5,
          series_id: undefined,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('description')).toBeNull();
        expect(formData.get('series_place')).toBe('5');
        expect(formData.get('series_id')).toBeNull();
      });

      it('should handle all possible fields', () => {
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
        const data = {
          story_id: 'story-123',
          title: 'Test Story',
          description: 'Test Description',
          series_id: 'series-456',
          series_name: 'Test Series',
          series_title: 'Series Title',
          image: file,
          image_url: 'https://example.com/image.jpg',
          series_place: 2,
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('story_id')).toBe('story-123');
        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('description')).toBe('Test Description');
        expect(formData.get('series_id')).toBe('series-456');
        expect(formData.get('series_name')).toBe('Test Series');
        expect(formData.get('series_title')).toBe('Series Title');
        expect(formData.get('file')).toBe(file);
        expect(formData.get('image_url')).toBe('https://example.com/image.jpg');
        expect(formData.get('series_place')).toBe('2');
      });
    });

    describe('Empty Data', () => {
      it('should handle empty object', () => {
        const data = {};

        const formData = buildStoryFormData(data);

        // FormData should exist but be empty
        expect(formData).toBeInstanceOf(FormData);
        expect(Array.from(formData.keys())).toHaveLength(0);
      });

      it('should handle object with only undefined values', () => {
        const data = {
          title: undefined,
          description: undefined,
        };

        const formData = buildStoryFormData(data);

        expect(Array.from(formData.keys())).toHaveLength(0);
      });
    });

    describe('Edge Cases', () => {
      it('should handle whitespace-only strings', () => {
        const data = {
          title: '   ',
          description: '\t\n',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('   ');
        expect(formData.get('description')).toBe('\t\n');
      });

      it('should handle unicode characters', () => {
        const data = {
          title: '测试故事 🎭',
          description: 'العربية テスト',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('测试故事 🎭');
        expect(formData.get('description')).toBe('العربية テスト');
      });

      it('should handle custom properties beyond interface', () => {
        const data = {
          title: 'Test Story',
          custom_field: 'custom value',
        };

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('custom_field')).toBe('custom value');
      });

      it('should not include prototype properties', () => {
        const data = {
          title: 'Test Story',
        };

        // Add property to prototype
        Object.setPrototypeOf(data, { protoProperty: 'should not appear' });

        const formData = buildStoryFormData(data);

        expect(formData.get('title')).toBe('Test Story');
        expect(formData.get('protoProperty')).toBeNull();
      });
    });

    describe('FormData Return Type', () => {
      it('should return FormData instance', () => {
        const data = {
          title: 'Test Story',
        };

        const formData = buildStoryFormData(data);

        expect(formData).toBeInstanceOf(FormData);
      });

      it('should be iterable', () => {
        const data = {
          title: 'Test Story',
          description: 'Test Description',
        };

        const formData = buildStoryFormData(data);

        const entries = Array.from(formData.entries());
        expect(entries.length).toBeGreaterThan(0);
      });
    });
  });
});
