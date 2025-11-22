import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { SerializedEditorState } from 'lexical';
import { useFetchStoryBlocks } from '../useFetchStoryBlocks';
import { api } from '../../../../api';
import axios, { AxiosError } from 'axios';
import { CustomSerializedParagraphNode } from '../../customNodes/CustomParagraphNode';

vi.mock('../../../../api');
vi.mock('../../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('../../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

describe('useFetchStoryBlocks', () => {
  const mockStoryId = 'test-story-id';
  const mockChapterId = 'test-chapter-id';
  const mockSetStoryBlocks = vi.fn();
  const mockPreviousNodeKeysRef = createRef() as React.MutableRefObject<Map<string, string>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviousNodeKeysRef.current = new Map();
    mockSetStoryBlocks.mockClear();
  });

  describe('Successful data fetching', () => {
    it('should fetch and process story blocks successfully', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              key_id: { Value: 'para-1' },
              chunk: { Value: JSON.stringify({
                type: 'custom-paragraph',
                children: [{ text: 'Hello World', type: 'text' }],
                key_id: 'para-1',
              })},
            },
            {
              key_id: { Value: 'para-2' },
              chunk: { Value: JSON.stringify({
                type: 'custom-paragraph',
                children: [{ text: 'Second paragraph', type: 'text' }],
                key_id: 'para-2',
              })},
            },
          ],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children).toHaveLength(2);
      expect(calledWith.root.children[0]).toMatchObject({
        type: 'custom-paragraph',
        key_id: 'para-1',
      });
    });

    it('should update previousNodeKeysRef with text content', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              key_id: { Value: 'para-1' },
              chunk: { Value: JSON.stringify({
                type: 'custom-paragraph',
                children: [{ text: 'Test content', type: 'text' }],
                key_id: 'para-1',
              })},
            },
          ],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockPreviousNodeKeysRef.current.get('para-1')).toBe('Test content');
      });
    });

    it('should handle empty items array', async () => {
      const mockResponse = {
        data: {
          items: [],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children).toHaveLength(0);
    });

    it('should generate blank line for missing chunk data', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              key_id: { Value: 'para-1' },
              chunk: null, // Missing chunk
            },
          ],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children).toHaveLength(1);
      expect(calledWith.root.children[0]).toMatchObject({
        type: 'custom-paragraph',
        children: [],
      });
    });
  });

  describe('Error handling', () => {
    it('should handle 404 error and create blank editor state', async () => {
      const error404 = {
        response: { status: 404 },
        isAxiosError: true,
      } as AxiosError;

      (api.get as Mock).mockRejectedValueOnce(error404);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children).toHaveLength(1);
      expect(calledWith.root.children[0]).toMatchObject({
        type: 'custom-paragraph',
        children: [],
      });
    });

    it('should handle 501 error and show alert', async () => {
      const error501 = {
        response: { status: 501 },
        isAxiosError: true,
      } as AxiosError;

      (api.get as Mock).mockRejectedValueOnce(error501);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      // Should create blank state for 501 too
      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children).toHaveLength(1);
    });

    it('should handle 501 status and update table status', async () => {
      const error501 = {
        response: { status: 501 },
        isAxiosError: true,
      } as AxiosError;

      (api.get as Mock).mockRejectedValueOnce(error501);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(result.current.previousTableStatus).toBe('501');
      });
    });

    it('should handle non-axios errors gracefully', async () => {
      const genericError = new Error('Network error');

      (api.get as Mock).mockRejectedValueOnce(genericError);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(false);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle other HTTP errors without creating blank state', async () => {
      const error500 = {
        response: { status: 500 },
        isAxiosError: true,
      } as AxiosError;

      (api.get as Mock).mockRejectedValueOnce(error500);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      // Should not call setStoryBlocks for 500 errors
      expect(mockSetStoryBlocks).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('API call parameters', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        data: { items: [] },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      const startKey = 'some-start-key';
      await result.current.getBatchedStoryBlocks(startKey);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          `/stories/${mockStoryId}/content`,
          expect.objectContaining({
            params: {
              key: startKey,
              chapter: mockChapterId,
            },
          })
        );
      });
    });

    it('should not fetch if required parameters are missing', async () => {
      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          '', // Empty storyId
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe('Table status management', () => {
    it('should set tableStatus to ok after successful fetch', async () => {
      const mockResponse = {
        data: { items: [] },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(result.current.tableStatus).toBe('ok');
      });
    });

    it('should track previous table status', async () => {
      const error501 = {
        response: { status: 501 },
        isAxiosError: true,
      } as AxiosError;

      (api.get as Mock).mockRejectedValueOnce(error501);
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(result.current.previousTableStatus).toBe('501');
      });

      // Now make a successful call
      const mockResponse = {
        data: { items: [] },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(result.current.tableStatus).toBe('ok');
        expect(result.current.previousTableStatus).toBe('501');
      });
    });
  });

  describe('Data transformation', () => {
    it('should ensure all paragraphs have custom-paragraph type', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              key_id: { Value: 'para-1' },
              chunk: { Value: JSON.stringify({
                type: 'paragraph', // Wrong type
                children: [{ text: 'Test', type: 'text' }],
                key_id: 'para-1',
              })},
            },
          ],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect(calledWith.root.children[0].type).toBe('custom-paragraph');
    });

    it('should preserve key_id from response', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              key_id: { Value: 'unique-key-123' },
              chunk: { Value: JSON.stringify({
                type: 'custom-paragraph',
                children: [],
                key_id: 'different-key', // Should be overridden
              })},
            },
          ],
        },
      };

      (api.get as Mock).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() =>
        useFetchStoryBlocks(
          mockStoryId,
          mockChapterId,
          mockSetStoryBlocks,
          mockPreviousNodeKeysRef
        )
      );

      await result.current.getBatchedStoryBlocks('');

      await waitFor(() => {
        expect(mockSetStoryBlocks).toHaveBeenCalledTimes(1);
      });

      const calledWith = mockSetStoryBlocks.mock.calls[0][0] as SerializedEditorState;
      expect((calledWith.root.children[0] as CustomSerializedParagraphNode).key_id).toBe('unique-key-123');
    });
  });
});
