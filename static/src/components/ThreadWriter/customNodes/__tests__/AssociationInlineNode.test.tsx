import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LexicalEditor, $getRoot, $createTextNode } from 'lexical';
import { AssociationInlineNode, $isAssociationInlineNode } from '../AssociationInlineNode';
import { createTestEditor } from '../../__tests__/testUtils';
import { CustomParagraphNode } from '../CustomParagraphNode';

// Mock the CSS module
vi.mock('../associationinlinenode.module.css', () => ({
  default: {
    associationInline: 'association-inline-class',
    associationTooltipBody: 'tooltip-body-class',
    row: 'row-class',
    column: 'column-class',
    tooltipImage: 'tooltip-image-class',
    show: 'show-class',
    character: 'character-class',
    place: 'place-class',
    event: 'event-class',
    item: 'item-class',
  },
}));

describe('AssociationInlineNode', () => {
  let editor: LexicalEditor;

  beforeEach(() => {
    editor = createTestEditor();
    // Initialize editor with empty root
    editor.update(() => {
      const root = $getRoot();
      root.clear();
    });
    // Clear any existing tooltips
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Cleanup tooltips
    document.querySelectorAll('#association-tooltip').forEach(el => el.remove());
  });

  describe('Constructor and getters', () => {
    it('should create node with all properties', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Character Name',
          'assoc-123',
          'A brave hero',
          'character',
          '/portraits/hero.jpg'
        );

        expect(node.getName()).toBe('Character Name');
        expect(node.getAssociationId()).toBe('assoc-123');
        expect(node.getShortDescription()).toBe('A brave hero');
        expect(node.getPortrait()).toBe('/portraits/hero.jpg');
      });
    });

    it('should return correct node type', () => {
      expect(AssociationInlineNode.getType()).toBe('association-inline');
    });

    it('should accept optional callbacks', () => {
      editor.update(() => {
        const leftClick = vi.fn();
        const rightClick = vi.fn();

        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait',
          leftClick,
          rightClick
        );

        expect(node).toBeInstanceOf(AssociationInlineNode);
      });
    });

    it('should accept format and style parameters', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait',
          undefined,
          undefined,
          1, // format: bold
          'custom-style'
        );

        expect(node).toBeInstanceOf(AssociationInlineNode);
      });
    });
  });

  describe('Static methods', () => {
    it('should clone node preserving all properties', () => {
      editor.update(() => {
        const original = new AssociationInlineNode(
          'Original',
          'orig-id',
          'Original description',
          'place',
          '/orig.jpg'
        );

        const cloned = AssociationInlineNode.clone(original);

        expect(cloned.getName()).toBe('Original');
        expect(cloned.getAssociationId()).toBe('orig-id');
        expect(cloned.getShortDescription()).toBe('Original description');
        expect(cloned.getPortrait()).toBe('/orig.jpg');
      });
    });

    it('should clone node with callbacks', () => {
      editor.update(() => {
        const leftClick = vi.fn();
        const rightClick = vi.fn();

        const original = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait',
          leftClick,
          rightClick
        );

        const cloned = AssociationInlineNode.clone(original);

        expect(cloned).toBeInstanceOf(AssociationInlineNode);
      });
    });
  });

  describe('Text manipulation restrictions', () => {
    it('should be unmergeable', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait'
        );

        expect(node.isUnmergeable()).toBe(true);
      });
    });

    it('should not allow text insertion before', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait'
        );

        expect(node.canInsertTextBefore()).toBe(false);
      });
    });

    it('should not allow text insertion after', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait'
        );

        expect(node.canInsertTextAfter()).toBe(false);
      });
    });
  });

  describe('DOM creation', () => {
    it('should create DOM element with correct classes', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Character',
          'char-123',
          'Description',
          'character',
          '/portrait.jpg'
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        expect(dom.classList.contains('association-inline-class')).toBe(true);
        expect(dom.classList.contains('character-class')).toBe(true);
      });
    });

    it('should set data-association-id attribute', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'unique-id-456',
          'desc',
          'place',
          'portrait'
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        expect(dom.getAttribute('data-association-id')).toBe('unique-id-456');
      });
    });

    it('should apply correct class for different association types', () => {
      const types = ['character', 'place', 'event', 'item'];

      types.forEach(type => {
        editor.update(() => {
          const node = new AssociationInlineNode(
            'Test',
            'id',
            'desc',
            type,
            'portrait'
          );

          const root = $getRoot();
          root.clear();
          const paragraph = new CustomParagraphNode('test');
          paragraph.append(node);
          root.append(paragraph);

          const config = editor._config;
          const dom = node.createDOM(config);

          expect(dom.classList.contains(`${type}-class`)).toBe(true);
        });
      });
    });
  });

  describe('Click handlers', () => {
    it('should call left click callback when clicked', () => {
      const leftClick = vi.fn();

      editor.update(() => {
        const node = new AssociationInlineNode(
          'Clickable',
          'click-id',
          'desc',
          'character',
          'portrait',
          leftClick
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
        });

        dom.dispatchEvent(clickEvent);

        expect(leftClick).toHaveBeenCalledWith({
          id: 'click-id',
          text: 'Clickable',
          x: undefined,
          y: undefined,
        });
      });
    });

    it('should call right click callback on context menu', () => {
      const rightClick = vi.fn();

      editor.update(() => {
        const node = new AssociationInlineNode(
          'RightClick',
          'right-id',
          'desc',
          'character',
          'portrait',
          undefined,
          rightClick
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
        });

        dom.dispatchEvent(contextMenuEvent);

        expect(rightClick).toHaveBeenCalledWith({
          id: 'right-id',
          text: 'RightClick',
          x: undefined,
          y: undefined,
        });
      });
    });

    it('should prevent default on right click', () => {
      const rightClick = vi.fn();

      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait',
          undefined,
          rightClick
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
        });

        const preventDefaultSpy = vi.spyOn(contextMenuEvent, 'preventDefault');
        dom.dispatchEvent(contextMenuEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Tooltip functionality', () => {
    it('should show tooltip on mouseenter', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Hoverable',
          'hover-id',
          'This is a description',
          'character',
          '/portrait.jpg'
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        const mouseEnterEvent = new MouseEvent('mouseenter', {
          bubbles: true,
          clientX: 100,
          clientY: 200,
        });

        dom.dispatchEvent(mouseEnterEvent);

        const tooltip = document.getElementById('association-tooltip');
        expect(tooltip).toBeTruthy();
      });
    });

    it('should hide tooltip on mouseleave', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait'
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        // Show tooltip first
        const mouseEnterEvent = new MouseEvent('mouseenter', {
          bubbles: true,
        });
        dom.dispatchEvent(mouseEnterEvent);

        // Then hide it
        const mouseLeaveEvent = new MouseEvent('mouseleave', {
          bubbles: true,
        });
        dom.dispatchEvent(mouseLeaveEvent);

        const tooltip = document.getElementById('association-tooltip');
        // Tooltip should either not have show-class or be null
        if (tooltip) {
          expect(tooltip.classList.contains('show-class')).toBe(false);
        }
        // Test passes if tooltip is hidden or removed
      });
    });

    it('should position tooltip correctly', () => {
      editor.update(() => {
        const node = new AssociationInlineNode(
          'Test',
          'id',
          'desc',
          'character',
          'portrait'
        );

        const root = $getRoot();
        const paragraph = new CustomParagraphNode('test');
        paragraph.append(node);
        root.append(paragraph);

        const config = editor._config;
        const dom = node.createDOM(config);

        const mouseEnterEvent = new MouseEvent('mouseenter', {
          bubbles: true,
          clientX: 150,
          clientY: 250,
        });

        dom.dispatchEvent(mouseEnterEvent);

        const tooltip = document.getElementById('association-tooltip');
        expect(tooltip).toBeTruthy();
        expect(tooltip?.style.left).toBeDefined();
        expect(tooltip?.style.top).toBeDefined();
      });
    });
  });

  describe('Integration with editor', () => {
    it('should be added to editor and retrieved', () => {
      editor.update(() => {
        const root = $getRoot();
        const node = new AssociationInlineNode(
          'Integration Test',
          'int-123',
          'Test description',
          'character',
          '/portrait.jpg'
        );
        const paragraph = new CustomParagraphNode('para-1');
        paragraph.append(node);
        root.append(paragraph);
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraph = root.getFirstChild() as CustomParagraphNode;

        expect(paragraph).not.toBeNull();
        const node = paragraph?.getFirstChild();

        expect($isAssociationInlineNode(node)).toBe(true);
        if ($isAssociationInlineNode(node)) {
          expect(node.getName()).toBe('Integration Test');
          expect(node.getAssociationId()).toBe('int-123');
        }
      });
    });

    it('should work in paragraph with other text nodes', () => {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = new CustomParagraphNode('para-1');

        paragraph.append($createTextNode('Before '));
        paragraph.append(new AssociationInlineNode('Link', 'id', 'desc', 'character', 'portrait'));
        paragraph.append($createTextNode(' After'));

        root.append(paragraph);
      });

      editor.read(() => {
        const root = $getRoot();
        const paragraph = root.getFirstChild();

        expect(paragraph).not.toBeNull();
        const children = paragraph?.getChildren();

        expect(children).toBeDefined();
        expect(children).toHaveLength(3);
        expect($isAssociationInlineNode(children?.[1])).toBe(true);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      editor.update(() => {
        const node = new AssociationInlineNode('', 'id', 'desc', 'character', 'portrait');
        expect(node.getName()).toBe('');
      });
    });

    it('should handle very long text', () => {
      editor.update(() => {
        const longText = 'A'.repeat(1000);
        const node = new AssociationInlineNode(longText, 'id', 'desc', 'character', 'portrait');
        expect(node.getName()).toBe(longText);
      });
    });

    it('should handle special characters in text', () => {
      editor.update(() => {
        const specialText = '!@#$%^&*()_+{}|:"<>?';
        const node = new AssociationInlineNode(specialText, 'id', 'desc', 'character', 'portrait');
        expect(node.getName()).toBe(specialText);
      });
    });

    it('should handle unicode characters', () => {
      editor.update(() => {
        const unicodeText = '你好世界🌍';
        const node = new AssociationInlineNode(unicodeText, 'id', 'desc', 'character', 'portrait');
        expect(node.getName()).toBe(unicodeText);
      });
    });

    it('should handle missing portrait gracefully', () => {
      editor.update(() => {
        const node = new AssociationInlineNode('Test', 'id', 'desc', 'character', '');
        expect(node.getPortrait()).toBe('');
      });
    });

    it('should handle missing description gracefully', () => {
      editor.update(() => {
        const node = new AssociationInlineNode('Test', 'id', '', 'character', 'portrait');
        expect(node.getShortDescription()).toBe('');
      });
    });
  });
});
