import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStoryImage } from '../useStoryImage';

// Mock useLoader
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();

vi.mock('../../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    loadingCount: 0,
  }),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

// Mock FileReader
class MockFileReader {
  result: ArrayBuffer | null = null;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;

  readAsArrayBuffer(_file: Blob) {
    // Simulate async read
    setTimeout(() => {
      this.result = new ArrayBuffer(8);
      if (this.onload) {
        this.onload.call(this as any, {} as ProgressEvent<FileReader>);
      }
    }, 0);
  }
}

global.FileReader = MockFileReader as any;

describe('useStoryImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  });

  describe('Initial State', () => {
    it('should initialize with default image URL', () => {
      const { result } = renderHook(() => useStoryImage());

      expect(result.current.imageURL).toBe('img/icons/story_standalone_icon.jpg');
    });

    it('should initialize with null image preview', () => {
      const { result } = renderHook(() => useStoryImage());

      expect(result.current.imagePreview).toBeNull();
    });

    it('should initialize with isImageLoading as false', () => {
      const { result } = renderHook(() => useStoryImage());

      expect(result.current.isImageLoading).toBe(false);
    });

    it('should initialize tempImageFile as undefined', () => {
      const { result } = renderHook(() => useStoryImage());

      expect(result.current.tempImageFile.current).toBeUndefined();
    });
  });

  describe('processImage', () => {
    it('should process single file', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.imagePreview).toBe('blob:mock-url');
      });
    });

    it('should set imageURL to blob URL', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.imageURL).toBe('blob:mock-url');
      });
    });

    it('should store file in tempImageFile ref', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.tempImageFile.current).toBe(file);
      });
    });

    it('should process multiple files', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file1 = new File(['content1'], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['content2'], 'test2.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file1, file2]);
      });

      await waitFor(() => {
        expect(result.current.tempImageFile.current).toBeDefined();
      });
    });

    it('should handle empty file array', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.processImage([]);
      });

      expect(result.current.imagePreview).toBeNull();
    });

    it('should create object URL for file', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(file);
      });
    });
  });

  describe('getRandomImageURL', () => {
    it('should fetch random image', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      let url = '';
      await act(async () => {
        url = await result.current.getRandomImageURL();
      });

      expect(url).toBe('https://picsum.photos/300/random123');
    });

    it('should show and hide loader', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      expect(mockShowLoader).toHaveBeenCalled();
      expect(mockHideLoader).toHaveBeenCalled();
    });

    it('should reset isImageLoading after fetch completes', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      expect(result.current.isImageLoading).toBe(false);
    });

    it('should only fetch once', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return imageURL on subsequent calls', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      let url2 = '';
      await act(async () => {
        url2 = await result.current.getRandomImageURL();
      });

      expect(url2).toBe(result.current.imageURL);
    });

    it('should handle fetch error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useStoryImage());

      let url = '';
      await act(async () => {
        url = await result.current.getRandomImageURL();
      });

      expect(url).toBe('img/icons/story_standalone_icon.jpg');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useStoryImage());

      let url = '';
      await act(async () => {
        url = await result.current.getRandomImageURL();
      });

      expect(url).toBe('img/icons/story_standalone_icon.jpg');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should create File from fetched blob', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      expect(result.current.tempImageFile.current).toBeInstanceOf(File);
      expect(result.current.tempImageFile.current?.type).toBe('image/png');
    });

    it('should use fallback URL when res.url is not available', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: undefined,
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      let url = '';
      await act(async () => {
        url = await result.current.getRandomImageURL();
      });

      expect(url).toBe('https://picsum.photos/300');
    });

    it('should default to image/jpeg if blob type is not set', async () => {
      const mockBlob = new Blob(['image data'], { type: '' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://picsum.photos/300/random123',
        blob: async () => mockBlob,
      });

      const { result } = renderHook(() => useStoryImage());

      await act(async () => {
        await result.current.getRandomImageURL();
      });

      expect(result.current.tempImageFile.current?.type).toBe('image/jpeg');
    });
  });

  describe('setImage', () => {
    it('should set imageURL', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image.jpg');
      });

      expect(result.current.imageURL).toBe('https://example.com/image.jpg');
    });

    it('should set imagePreview', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image.jpg');
      });

      expect(result.current.imagePreview).toBe('https://example.com/image.jpg');
    });

    it('should set both to same URL', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image.jpg');
      });

      expect(result.current.imageURL).toBe(result.current.imagePreview);
    });

    it('should handle empty string', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('');
      });

      expect(result.current.imageURL).toBe('');
      expect(result.current.imagePreview).toBe('');
    });

    it('should override previous image', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image1.jpg');
      });

      act(() => {
        result.current.setImage('https://example.com/image2.jpg');
      });

      expect(result.current.imageURL).toBe('https://example.com/image2.jpg');
    });
  });

  describe('onImageLoad', () => {
    it('should set isImageLoading to false', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.onImageLoad();
      });

      expect(result.current.isImageLoading).toBe(false);
    });

    it('should be callable', () => {
      const { result } = renderHook(() => useStoryImage());

      expect(() => {
        act(() => {
          result.current.onImageLoad();
        });
      }).not.toThrow();
    });
  });

  describe('resetImage', () => {
    it('should reset imageURL to default', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image.jpg');
      });

      act(() => {
        result.current.resetImage();
      });

      expect(result.current.imageURL).toBe('img/icons/story_standalone_icon.jpg');
    });

    it('should reset imagePreview to null', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.setImage('https://example.com/image.jpg');
      });

      act(() => {
        result.current.resetImage();
      });

      expect(result.current.imagePreview).toBeNull();
    });

    it('should clear tempImageFile', async () => {
      const { result } = renderHook(() => useStoryImage());
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.tempImageFile.current).toBeDefined();
      });

      act(() => {
        result.current.resetImage();
      });

      expect(result.current.tempImageFile.current).toBeUndefined();
    });

    it('should be safe to call multiple times', () => {
      const { result } = renderHook(() => useStoryImage());

      act(() => {
        result.current.resetImage();
        result.current.resetImage();
      });

      expect(result.current.imageURL).toBe('img/icons/story_standalone_icon.jpg');
      expect(result.current.imagePreview).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should support complete image workflow', async () => {
      const { result } = renderHook(() => useStoryImage());

      // Start with default
      expect(result.current.imageURL).toBe('img/icons/story_standalone_icon.jpg');

      // Upload custom image
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.imageURL).toBe('blob:mock-url');
      });

      // Reset
      act(() => {
        result.current.resetImage();
      });

      expect(result.current.imageURL).toBe('img/icons/story_standalone_icon.jpg');
      expect(result.current.tempImageFile.current).toBeUndefined();
    });

    it('should handle switching between different images', async () => {
      const { result } = renderHook(() => useStoryImage());

      // Set URL directly
      act(() => {
        result.current.setImage('https://example.com/image1.jpg');
      });

      expect(result.current.imageURL).toBe('https://example.com/image1.jpg');

      // Upload file
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      act(() => {
        result.current.processImage([file]);
      });

      await waitFor(() => {
        expect(result.current.imageURL).toBe('blob:mock-url');
      });

      // Set URL again
      act(() => {
        result.current.setImage('https://example.com/image2.jpg');
      });

      expect(result.current.imageURL).toBe('https://example.com/image2.jpg');
    });
  });
});
