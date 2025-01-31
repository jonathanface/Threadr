// src/utils/dbEventEmitter.ts
// Import necessary types if using TypeScript
export type DBEventTypes =
    | 'saveSuccess'
    | 'saveError'
    | 'deleteSuccess'
    | 'deleteError'
    | 'syncOrderSuccess'
    | 'syncOrderError';

// Define interfaces for event payloads
export interface SaveSuccessPayload {
    storyID: string;
    chapterID: string;
    response?: any; // Replace 'any' with the actual response type
}

export interface SaveErrorPayload {
    storyID: string;
    chapterID: string;
    error: Error;
}

export interface DeleteSuccessPayload {
    storyID: string;
    chapterID: string;
    response?: any;
}

export interface DeleteErrorPayload {
    storyID: string;
    chapterID: string;
    error: Error;
}

export interface SyncOrderSuccessPayload {
    storyID: string;
    chapterID: string;
    response?: any;
}

export interface SyncOrderErrorPayload {
    storyID: string;
    chapterID: string;
    error: Error;
}

// Create a singleton EventTarget instance
export const dbEventEmitter = new EventTarget();

// src/utils/dbEventEmitter.ts (continued)

// Function to emit 'saveSuccess' event
export const emitSaveSuccess = (payload: SaveSuccessPayload) => {
    const event = new CustomEvent<SaveSuccessPayload>('saveSuccess', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

// Function to emit 'saveError' event
export const emitSaveError = (payload: SaveErrorPayload) => {
    const event = new CustomEvent<SaveErrorPayload>('saveError', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

// Similarly, create emit functions for other event types
export const emitDeleteSuccess = (payload: DeleteSuccessPayload) => {
    const event = new CustomEvent<DeleteSuccessPayload>('deleteSuccess', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

export const emitDeleteError = (payload: DeleteErrorPayload) => {
    const event = new CustomEvent<DeleteErrorPayload>('deleteError', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

export const emitSyncOrderSuccess = (payload: SyncOrderSuccessPayload) => {
    const event = new CustomEvent<SyncOrderSuccessPayload>('syncOrderSuccess', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

export const emitSyncOrderError = (payload: SyncOrderErrorPayload) => {
    const event = new CustomEvent<SyncOrderErrorPayload>('syncOrderError', { detail: payload });
    dbEventEmitter.dispatchEvent(event);
};

