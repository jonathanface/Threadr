import React, { ReactNode } from 'react';
import { renderHook, RenderHookOptions } from '@testing-library/react';
import { createEditor, LexicalEditor, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { CustomParagraphNode } from '../customNodes/CustomParagraphNode';
import { AssociationInlineNode } from '../customNodes/AssociationInlineNode';

/**
 * Creates a test Lexical editor with custom nodes registered
 */
export function createTestEditor(): LexicalEditor {
  return createEditor({
    nodes: [CustomParagraphNode, AssociationInlineNode],
    onError: (error: Error) => {
      throw error;
    },
  });
}

/**
 * Helper to create a simple editor state with text content
 */
export function createEditorWithContent(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const paragraph = $createParagraphNode();
    const textNode = $createTextNode(text);
    paragraph.append(textNode);
    root.append(paragraph);
  });
}

/**
 * Helper to get text content from editor
 */
export function getEditorTextContent(editor: LexicalEditor): string {
  let text = '';
  editor.getEditorState().read(() => {
    const root = $getRoot();
    text = root.getTextContent();
  });
  return text;
}

/**
 * Wrapper for rendering hooks with common test providers
 */
export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: RenderHookOptions<TProps> & {
    wrapper?: ({ children }: { children: ReactNode }) => React.ReactElement;
  }
) {
  return renderHook(hook, options);
}

/**
 * Mock localStorage for testing
 */
export class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

/**
 * Setup mock localStorage before tests
 */
export function setupMockLocalStorage(): MockLocalStorage {
  const mockLocalStorage = new MockLocalStorage();
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
  return mockLocalStorage;
}
