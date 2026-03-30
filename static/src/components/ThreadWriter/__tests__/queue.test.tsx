import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueOp, QueueSyncOrder, ProcessDBQueue } from '../queue';
import { DBOperationType } from '../../../types/DBOperations';
import { api } from '../../../api';
import * as EventEmitter from '../../../utils/EventEmitter';

// Mock the API
vi.mock('../../../api', () => ({
  api: {
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the event emitter
vi.mock('../../../utils/EventEmitter', () => ({
  emitSaveSuccess: vi.fn(),
  emitSaveError: vi.fn(),
  emitDeleteSuccess: vi.fn(),
  emitDeleteError: vi.fn(),
  emitSyncOrderSuccess: vi.fn(),
  emitSyncOrderError: vi.fn(),
}));

describe('Queue', () => {
  const mockStoryId = 'story-123';
  const mockChapterId = 'chapter-456';
  const mockBlock = {
    key_id: 'block-1',
    chunk: { type: 'custom-paragraph', children: [] } as any,
    place: '0',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the internal queue state by processing it
    await ProcessDBQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('QueueOp', () => {
    it('should queue a save operation', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      expect(api.put).toHaveBeenCalledWith(
        `/stories/${mockStoryId}`,
        {
          story_id: mockStoryId,
          chapter_id: mockChapterId,
          blocks: [mockBlock],
        },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should queue a delete operation', async () => {
      vi.mocked(api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      expect(api.delete).toHaveBeenCalledWith(
        `/stories/${mockStoryId}/block`,
        expect.objectContaining({
          data: {
            story_id: mockStoryId,
            chapter_id: mockChapterId,
            blocks: [mockBlock],
          },
        }),
      );
    });

    it('should ignore save after delete for the same block', async () => {
      vi.mocked(api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      // Queue delete first
      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      // Try to queue save after (should be ignored)
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Only delete should be called
      expect(api.delete).toHaveBeenCalledTimes(1);
      expect(api.put).not.toHaveBeenCalled();
    });

    it('should overwrite save with delete for the same block', async () => {
      vi.mocked(api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      // Queue save first
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      // Queue delete after (should overwrite)
      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Only delete should be called
      expect(api.delete).toHaveBeenCalledTimes(1);
      expect(api.put).not.toHaveBeenCalled();
    });

    it('should update existing save operation with newer data', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const block1 = { ...mockBlock, place: '0' };
      const block2 = { ...mockBlock, place: '1' };

      // Queue first save
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block1,
        false,
        { epoch: 1 },
      );

      // Queue second save for same block (should update)
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block2,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should only make one call with the latest data
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledWith(
        `/stories/${mockStoryId}`,
        expect.objectContaining({
          blocks: [block2],
        }),
        expect.any(Object),
      );
    });

    it('should handle operations from different epochs separately', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const block1 = { ...mockBlock, key_id: 'block-1' };
      const block2 = { ...mockBlock, key_id: 'block-2' };

      // Queue operations with different epochs
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block1,
        false,
        { epoch: 1 },
      );

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block2,
        false,
        { epoch: 2 },
      );

      await ProcessDBQueue();

      // Should make separate calls for different epochs
      expect(api.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('QueueSyncOrder', () => {
    it('should queue and process order sync operation', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const orderMap = {
        chapter_id: mockChapterId,
        blocks: [
          { key_id: 'block-1', place: '0' },
          { key_id: 'block-2', place: '1' },
        ],
      };

      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        storyID: mockStoryId,
        chapterID: mockChapterId,
        time: Date.now(),
        tableBecameReady: false,
        epoch: 1,
      });

      await ProcessDBQueue();

      expect(api.put).toHaveBeenCalledWith(
        `/stories/${mockStoryId}/orderMap`,
        orderMap,
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should handle multiple order sync operations in sequence', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const orderMap1 = {
        chapter_id: mockChapterId,
        blocks: [{ key_id: 'block-1', place: '0' }],
      };

      const orderMap2 = {
        chapter_id: mockChapterId,
        blocks: [{ key_id: 'block-2', place: '1' }],
      };

      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap1,
        blocks: [],
        storyID: mockStoryId,
        chapterID: mockChapterId,
        time: Date.now(),
        tableBecameReady: false,
      });

      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap2,
        blocks: [],
        storyID: mockStoryId,
        chapterID: mockChapterId,
        time: Date.now(),
        tableBecameReady: false,
      });

      await ProcessDBQueue();

      // Should process only the most recent operation (deduplicated)
      expect(api.put).toHaveBeenCalledTimes(1);
      // Verify it was the second order map (most recent)
      expect(api.put).toHaveBeenCalledWith(
        '/stories/story-123/orderMap',
        orderMap2,
        expect.any(Object),
      );
    });
  });

  describe('ProcessDBQueue', () => {
    it('should batch multiple save operations for the same chapter', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const block1 = { ...mockBlock, key_id: 'block-1', place: '0' };
      const block2 = { ...mockBlock, key_id: 'block-2', place: '1' };
      const block3 = { ...mockBlock, key_id: 'block-3', place: '2' };

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block1,
        false,
        { epoch: 1 },
      );

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block2,
        false,
        { epoch: 1 },
      );

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block3,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should batch all three in one call
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledWith(
        `/stories/${mockStoryId}`,
        expect.objectContaining({
          blocks: expect.arrayContaining([block1, block2, block3]),
        }),
        expect.any(Object),
      );
    });

    it('should emit saveSuccess event when tableBecameReady is true', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        true, // tableBecameReady
        { epoch: 1 },
      );

      await ProcessDBQueue();

      expect(EventEmitter.emitSaveSuccess).toHaveBeenCalledWith({
        storyID: mockStoryId,
        chapterID: mockChapterId,
      });
    });

    it('should emit deleteSuccess event when tableBecameReady is true', async () => {
      vi.mocked(api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        true, // tableBecameReady
        { epoch: 1 },
      );

      await ProcessDBQueue();

      expect(EventEmitter.emitDeleteSuccess).toHaveBeenCalledWith({
        storyID: mockStoryId,
        chapterID: mockChapterId,
      });
    });

    it('should emit syncOrderSuccess event when tableBecameReady is true', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const orderMap = {
        chapter_id: mockChapterId,
        blocks: [{ key_id: 'block-1', place: '0' }],
      };

      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        storyID: mockStoryId,
        chapterID: mockChapterId,
        time: Date.now(),
        tableBecameReady: true,
      });

      await ProcessDBQueue();

      expect(EventEmitter.emitSyncOrderSuccess).toHaveBeenCalledWith({
        storyID: mockStoryId,
        chapterID: mockChapterId,
      });
    });

    it('should handle API errors and requeue failed operations', async () => {
      // First call fails, second call succeeds
      vi.mocked(api.put)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      // First process should fail and requeue
      await ProcessDBQueue();

      // Second process should succeed
      await ProcessDBQueue();

      expect(api.put).toHaveBeenCalledTimes(2);
    });

    it('should accept 501 status as valid response for saves', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 501, data: {} } as any);

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should not throw or requeue
      expect(api.put).toHaveBeenCalledTimes(1);
    });

    it('should accept 501 status as valid response for deletes', async () => {
      vi.mocked(api.delete).mockResolvedValue({ status: 501, data: {} } as any);

      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should not throw or requeue
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should not save blocks that are also being deleted', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);
      vi.mocked(api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      const block1 = { ...mockBlock, key_id: 'block-1' };
      const block2 = { ...mockBlock, key_id: 'block-2' };

      // Queue save for both blocks
      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block1,
        false,
        { epoch: 1 },
      );

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        block2,
        false,
        { epoch: 1 },
      );

      // Queue delete for block1
      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        block1,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should only save block2, and delete block1
      expect(api.put).toHaveBeenCalledWith(
        `/stories/${mockStoryId}`,
        expect.objectContaining({
          blocks: [block2],
        }),
        expect.any(Object),
      );

      expect(api.delete).toHaveBeenCalledWith(
        `/stories/${mockStoryId}/block`,
        expect.objectContaining({
          data: expect.objectContaining({
            blocks: [block1],
          }),
        }),
      );
    });

    it('should process deletes before saves to prevent paste race condition', async () => {
      // Simulates select-and-paste: old blocks at places 1,2 are replaced by
      // new blocks at the same places. Because DynamoDB keys on (composite_key, place),
      // deletes must run first so they remove the OLD rows before saves write new ones.
      const callOrder: string[] = [];
      vi.mocked(api.delete).mockImplementation(async () => {
        callOrder.push('delete');
        return { status: 200, data: {} } as any;
      });
      vi.mocked(api.put).mockImplementation(async () => {
        callOrder.push('save');
        return { status: 200, data: {} } as any;
      });

      const oldBlock1 = { key_id: 'old-block-1', place: '1' };
      const oldBlock2 = { key_id: 'old-block-2', place: '2' };
      const newBlock1 = { key_id: 'new-block-1', chunk: { type: 'custom-paragraph', children: [] } as any, place: '1' };
      const newBlock2 = { key_id: 'new-block-2', chunk: { type: 'custom-paragraph', children: [] } as any, place: '2' };

      // Queue deletes for old blocks and saves for new blocks (different key_ids, same places)
      QueueOp(DBOperationType.delete, mockStoryId, mockChapterId, oldBlock1, false, { epoch: 1 });
      QueueOp(DBOperationType.delete, mockStoryId, mockChapterId, oldBlock2, false, { epoch: 1 });
      QueueOp(DBOperationType.save, mockStoryId, mockChapterId, newBlock1, false, { epoch: 1 });
      QueueOp(DBOperationType.save, mockStoryId, mockChapterId, newBlock2, false, { epoch: 1 });

      await ProcessDBQueue();

      expect(api.delete).toHaveBeenCalledTimes(1);
      expect(api.put).toHaveBeenCalledTimes(1);
      // Delete must fire before save
      expect(callOrder).toEqual(['delete', 'save']);
    });

    it('should clear the queue after processing', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Process again - should not make any API calls
      await ProcessDBQueue();

      // Should only have been called once
      expect(api.put).toHaveBeenCalledTimes(1);
    });

    it('should handle operations for different chapters separately', async () => {
      vi.mocked(api.put).mockResolvedValue({ status: 200, data: {} } as any);

      const chapter1 = 'chapter-1';
      const chapter2 = 'chapter-2';

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        chapter1,
        { ...mockBlock, key_id: 'block-1' },
        false,
        { epoch: 1 },
      );

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        chapter2,
        { ...mockBlock, key_id: 'block-2' },
        false,
        { epoch: 1 },
      );

      await ProcessDBQueue();

      // Should make separate calls for different chapters
      expect(api.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error handling', () => {
    it('should handle save errors gracefully', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('Server error'));

      QueueOp(
        DBOperationType.save,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await expect(ProcessDBQueue()).resolves.not.toThrow();

      // Verify that the operation was attempted
      expect(api.put).toHaveBeenCalled();
    });

    it('should handle delete errors gracefully', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('Server error'));

      QueueOp(
        DBOperationType.delete,
        mockStoryId,
        mockChapterId,
        mockBlock,
        false,
        { epoch: 1 },
      );

      await expect(ProcessDBQueue()).resolves.not.toThrow();

      // Verify that the operation was attempted
      expect(api.delete).toHaveBeenCalled();
    });

    it('should handle sync order errors gracefully', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('Server error'));

      const orderMap = {
        chapter_id: mockChapterId,
        blocks: [{ key_id: 'block-1', place: '0' }],
      };

      QueueSyncOrder({
        type: DBOperationType.syncOrder,
        orderList: orderMap,
        blocks: [],
        storyID: mockStoryId,
        chapterID: mockChapterId,
        time: Date.now(),
        tableBecameReady: false,
      });

      await expect(ProcessDBQueue()).resolves.not.toThrow();

      // Verify that the operation was attempted
      expect(api.put).toHaveBeenCalled();
    });
  });
});
