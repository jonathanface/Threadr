import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dbEventEmitter,
  emitSaveSuccess,
  emitSaveError,
  emitDeleteSuccess,
  emitDeleteError,
  emitSyncOrderSuccess,
  emitSyncOrderError,
  SaveSuccessPayload,
  SaveErrorPayload,
  DeleteSuccessPayload,
  DeleteErrorPayload,
  SyncOrderSuccessPayload,
  SyncOrderErrorPayload,
} from '../EventEmitter';

describe('EventEmitter', () => {
  beforeEach(() => {
    // Clear any existing event listeners
    // Note: EventTarget doesn't have a clear method, but we can ensure clean state
    // by using new listeners in each test
  });

  describe('dbEventEmitter', () => {
    it('should be an instance of EventTarget', () => {
      expect(dbEventEmitter).toBeInstanceOf(EventTarget);
    });

    it('should be a singleton', async () => {
      // Import again to check it's the same instance
      const { dbEventEmitter: emitter2 } = await import('../EventEmitter');
      expect(dbEventEmitter).toBe(emitter2);
    });
  });

  describe('emitSaveSuccess', () => {
    it('should emit saveSuccess event with payload', () => {
      const payload: SaveSuccessPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        response: { success: true },
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('saveSuccess', listener);

      emitSaveSuccess(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<SaveSuccessPayload>;
      expect(event.detail).toEqual(payload);

      dbEventEmitter.removeEventListener('saveSuccess', listener);
    });

    it('should emit event without response', () => {
      const payload: SaveSuccessPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('saveSuccess', listener);

      emitSaveSuccess(payload);

      expect(listener).toHaveBeenCalled();
      const event = listener.mock.calls[0][0] as CustomEvent<SaveSuccessPayload>;
      expect(event.detail).toEqual(payload);

      dbEventEmitter.removeEventListener('saveSuccess', listener);
    });

    it('should call multiple listeners', () => {
      const payload: SaveSuccessPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
      };

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      dbEventEmitter.addEventListener('saveSuccess', listener1);
      dbEventEmitter.addEventListener('saveSuccess', listener2);

      emitSaveSuccess(payload);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);

      dbEventEmitter.removeEventListener('saveSuccess', listener1);
      dbEventEmitter.removeEventListener('saveSuccess', listener2);
    });
  });

  describe('emitSaveError', () => {
    it('should emit saveError event with error payload', () => {
      const error = new Error('Save failed');
      const payload: SaveErrorPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        error,
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('saveError', listener);

      emitSaveError(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<SaveErrorPayload>;
      expect(event.detail).toEqual(payload);
      expect(event.detail.error).toBe(error);

      dbEventEmitter.removeEventListener('saveError', listener);
    });
  });

  describe('emitDeleteSuccess', () => {
    it('should emit deleteSuccess event with payload', () => {
      const payload: DeleteSuccessPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        response: { deleted: true },
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('deleteSuccess', listener);

      emitDeleteSuccess(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<DeleteSuccessPayload>;
      expect(event.detail).toEqual(payload);

      dbEventEmitter.removeEventListener('deleteSuccess', listener);
    });
  });

  describe('emitDeleteError', () => {
    it('should emit deleteError event with error payload', () => {
      const error = new Error('Delete failed');
      const payload: DeleteErrorPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        error,
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('deleteError', listener);

      emitDeleteError(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<DeleteErrorPayload>;
      expect(event.detail).toEqual(payload);
      expect(event.detail.error).toBe(error);

      dbEventEmitter.removeEventListener('deleteError', listener);
    });
  });

  describe('emitSyncOrderSuccess', () => {
    it('should emit syncOrderSuccess event with payload', () => {
      const payload: SyncOrderSuccessPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        response: { synced: true },
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('syncOrderSuccess', listener);

      emitSyncOrderSuccess(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<SyncOrderSuccessPayload>;
      expect(event.detail).toEqual(payload);

      dbEventEmitter.removeEventListener('syncOrderSuccess', listener);
    });
  });

  describe('emitSyncOrderError', () => {
    it('should emit syncOrderError event with error payload', () => {
      const error = new Error('Sync order failed');
      const payload: SyncOrderErrorPayload = {
        storyID: 'story-123',
        chapterID: 'chapter-456',
        error,
      };

      const listener = vi.fn();
      dbEventEmitter.addEventListener('syncOrderError', listener);

      emitSyncOrderError(payload);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<SyncOrderErrorPayload>;
      expect(event.detail).toEqual(payload);
      expect(event.detail.error).toBe(error);

      dbEventEmitter.removeEventListener('syncOrderError', listener);
    });
  });

  describe('Event Isolation', () => {
    it('should not trigger listeners for different event types', () => {
      const saveListener = vi.fn();
      const deleteListener = vi.fn();

      dbEventEmitter.addEventListener('saveSuccess', saveListener);
      dbEventEmitter.addEventListener('deleteSuccess', deleteListener);

      emitSaveSuccess({ storyID: 'story-123', chapterID: 'chapter-456' });

      expect(saveListener).toHaveBeenCalledTimes(1);
      expect(deleteListener).not.toHaveBeenCalled();

      dbEventEmitter.removeEventListener('saveSuccess', saveListener);
      dbEventEmitter.removeEventListener('deleteSuccess', deleteListener);
    });

    it('should handle listener removal correctly', () => {
      const listener = vi.fn();

      dbEventEmitter.addEventListener('saveSuccess', listener);
      emitSaveSuccess({ storyID: 'story-123', chapterID: 'chapter-456' });

      expect(listener).toHaveBeenCalledTimes(1);

      dbEventEmitter.removeEventListener('saveSuccess', listener);
      emitSaveSuccess({ storyID: 'story-123', chapterID: 'chapter-456' });

      // Should still be 1 (not called again after removal)
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Events', () => {
    it('should handle rapid successive events', () => {
      const listener = vi.fn();
      dbEventEmitter.addEventListener('saveSuccess', listener);

      for (let i = 0; i < 10; i++) {
        emitSaveSuccess({
          storyID: `story-${i}`,
          chapterID: `chapter-${i}`,
        });
      }

      expect(listener).toHaveBeenCalledTimes(10);

      dbEventEmitter.removeEventListener('saveSuccess', listener);
    });

    it('should preserve event details for each emission', () => {
      const listener = vi.fn();
      dbEventEmitter.addEventListener('saveSuccess', listener);

      const payload1 = { storyID: 'story-1', chapterID: 'chapter-1' };
      const payload2 = { storyID: 'story-2', chapterID: 'chapter-2' };

      emitSaveSuccess(payload1);
      emitSaveSuccess(payload2);

      expect(listener).toHaveBeenCalledTimes(2);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(payload1);
      expect((listener.mock.calls[1][0] as CustomEvent).detail).toEqual(payload2);

      dbEventEmitter.removeEventListener('saveSuccess', listener);
    });
  });

  // Note: Error handling in EventTarget is managed by the browser
  // and listeners that throw will cause the event dispatch to throw.
  // This is expected behavior and doesn't need explicit testing.
});
