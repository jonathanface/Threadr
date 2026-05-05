import { $isTextNode, DOMExportOutput, EditorConfig, LexicalEditor, NodeKey, ParagraphNode, type RangeSelection, SerializedParagraphNode } from "lexical";
import { v4 as uuidv4 } from "uuid";
export interface CustomSerializedParagraphNode extends SerializedParagraphNode {
    type: "custom-paragraph";
    version: 1;
    key_id: string;
    style?: string;
}

export class CustomParagraphNode extends ParagraphNode {
    __key_id: string;

    constructor(key_id?: string | null, key?: NodeKey) {
        super(key);
        this.__key_id = key_id ?? uuidv4();
    }

    static getType(): "custom-paragraph" {
        return "custom-paragraph";
    }

    static clone(node: CustomParagraphNode): CustomParagraphNode {
        return new CustomParagraphNode(node.__key_id, node.__key); // Pass the same __key
    }

    static importJSON(serializedNode: CustomSerializedParagraphNode): CustomParagraphNode {
        const node = new CustomParagraphNode(serializedNode.key_id || uuidv4());
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        if (serializedNode.style) {
            node.setStyle(serializedNode.style);
        }
        return node;
    }

    exportJSON(): CustomSerializedParagraphNode {
        const base = super.exportJSON();
        const json: CustomSerializedParagraphNode = {
            ...base,
            type: "custom-paragraph",
            version: 1,
            key_id: this.__key_id,
        };
        const style = this.getStyle();
        if (style) {
            json.style = style;
        }
        return json;
    }

    exportDOM(editor: LexicalEditor): DOMExportOutput {
        // Let parent handle children and text-align style
        const result = super.exportDOM(editor);
        // Add legacy align attribute for better compatibility with apps like LibreOffice
        const formatType = this.getFormatType();
        if (formatType && result.element instanceof HTMLElement) {
            result.element.setAttribute('align', formatType);
        }
        // Merge any paragraph-level CSS (e.g. line-height from selection-level
        // line-spacing) into whatever super.exportDOM already wrote.
        const customStyle = this.getStyle();
        if (customStyle && result.element instanceof HTMLElement) {
            const existing = result.element.getAttribute("style") ?? "";
            const trimmed = existing.replace(/;\s*$/, "");
            const merged = trimmed ? `${trimmed}; ${customStyle}` : customStyle;
            result.element.setAttribute("style", merged);
        }
        return result;
    }

    setKeyId(key_id: string): void {
        const writable = this.getWritable();
        writable.__key_id = key_id;
    }

    getKeyId(): string {
        return this.__key_id;
    }
    insertNewAfter(rangeSelection?: RangeSelection, restoreSelection?: boolean): CustomParagraphNode {
        const next = new CustomParagraphNode();
        // Carry over any text-level format/style buffered on the selection so
        // the next character typed in the new paragraph keeps the same bold/
        // italic/underline + font-family/font-size as the cursor had.
        if (rangeSelection) {
            let textFormat = rangeSelection.format;
            let textStyle = rangeSelection.style;
            // Lexical normally populates selection.format/style from the
            // anchor TextNode during DOM-event-driven selection sync, but
            // this isn't guaranteed for programmatic flows. Read straight
            // off the anchor as a fallback so carry-over always sticks.
            if (!textStyle || !textFormat) {
                const anchorNode = rangeSelection.anchor.getNode();
                if ($isTextNode(anchorNode)) {
                    if (!textStyle) textStyle = anchorNode.getStyle();
                    if (!textFormat) textFormat = anchorNode.getFormat();
                }
            }
            next.setTextFormat(textFormat);
            next.setTextStyle(textStyle);
        }
        const dir = this.getDirection();
        if (dir) next.setDirection(dir);
        // Carry over alignment so a centered/justified paragraph stays so on Enter.
        next.setFormat(this.getFormatType());
        // Carry over paragraph-level CSS (line-height etc.) so the spacing the
        // user picked is preserved across paragraph breaks.
        const paragraphStyle = this.getStyle();
        if (paragraphStyle) {
            next.setStyle(paragraphStyle);
        }
        this.insertAfter(next, restoreSelection ?? true);
        return next;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config); // Creates the default <p> element
        const className = config.theme['custom-paragraph']; // Get the class from the theme
        if (className) {
            element.className = className; // Apply the custom class
        }
        const style = this.getStyle();
        if (style) {
            element.setAttribute("style", style);
        }
        return element;
    }

    updateDOM(prevNode: CustomParagraphNode, dom: HTMLElement, config: EditorConfig): boolean {
        // Lexical's ParagraphNode.updateDOM returns false (no-op). We extend it
        // so that paragraph-level __style changes (line-height) re-paint the
        // live DOM without forcing a full node recreation.
        // Read __style directly: getStyle() routes through getLatest(), which
        // by reconcile time resolves to the *next* version — so prev and next
        // would always compare equal and the DOM mutation would be skipped.
        // (TextNode.updateDOM does the same direct-field trick for the same
        // reason.)
        const prevStyle = (prevNode as unknown as { __style: string }).__style;
        const nextStyle = (this as unknown as { __style: string }).__style;
        if (prevStyle !== nextStyle) {
            if (nextStyle) {
                dom.setAttribute("style", nextStyle);
            } else {
                dom.removeAttribute("style");
            }
        }
        return super.updateDOM(prevNode, dom, config);
    }
}
