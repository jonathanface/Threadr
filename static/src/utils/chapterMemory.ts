/**
 * Utility functions for remembering user's last viewed chapter and cursor position
 * Uses localStorage for client-side persistence
 */

const LAST_CHAPTER_PREFIX = "lastChapter_";
const CURSOR_POSITION_PREFIX = "cursorPos_";

export interface CursorPosition {
  paragraphKeyId: string;
  offset: number;
}

/**
 * Save the last viewed chapter for a story
 */
export const saveLastChapter = (storyId: string, chapterId: string): void => {
  try {
    localStorage.setItem(`${LAST_CHAPTER_PREFIX}${storyId}`, chapterId);
  } catch (error) {
    console.warn("Failed to save last chapter to localStorage:", error);
  }
};

/**
 * Get the last viewed chapter for a story
 */
export const getLastChapter = (storyId: string): string | null => {
  try {
    return localStorage.getItem(`${LAST_CHAPTER_PREFIX}${storyId}`);
  } catch (error) {
    console.warn("Failed to read last chapter from localStorage:", error);
    return null;
  }
};

/**
 * Save cursor position for a specific chapter
 */
export const saveCursorPosition = (
  storyId: string,
  chapterId: string,
  position: CursorPosition,
): void => {
  try {
    localStorage.setItem(
      `${CURSOR_POSITION_PREFIX}${storyId}_${chapterId}`,
      JSON.stringify(position),
    );
  } catch (error) {
    console.warn("Failed to save cursor position to localStorage:", error);
  }
};

/**
 * Get saved cursor position for a specific chapter
 */
export const getCursorPosition = (
  storyId: string,
  chapterId: string,
): CursorPosition | null => {
  try {
    const saved = localStorage.getItem(
      `${CURSOR_POSITION_PREFIX}${storyId}_${chapterId}`,
    );
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn("Failed to read cursor position from localStorage:", error);
    return null;
  }
};

/**
 * Clear all saved data for a specific story (useful for cleanup)
 */
export const clearStoryMemory = (storyId: string): void => {
  try {
    localStorage.removeItem(`${LAST_CHAPTER_PREFIX}${storyId}`);
    // Note: Cursor positions for individual chapters will remain
    // until explicitly cleared or overwritten
  } catch (error) {
    console.warn("Failed to clear story memory from localStorage:", error);
  }
};
