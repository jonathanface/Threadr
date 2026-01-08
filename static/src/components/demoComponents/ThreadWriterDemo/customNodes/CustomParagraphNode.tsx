import { DOMExportOutput, EditorConfig, LexicalEditor, ParagraphNode, SerializedParagraphNode } from "lexical";

export interface CustomSerializedParagraphNode extends SerializedParagraphNode {
    key_id: string;
}

export class CustomParagraphNode extends ParagraphNode {
    __key_id: string | null;

    constructor(key_id: string | null = null, key?: string) {
        super(key); // Pass the key to the parent constructor
        this.__key_id = key_id;
    }

    static getType(): string {
        return "custom-paragraph"; // Unique type
    }

    static clone(node: CustomParagraphNode): CustomParagraphNode {
        return new CustomParagraphNode(node.__key_id, node.__key); // Pass the same __key
    }

    static importJSON(serializedNode: CustomSerializedParagraphNode): CustomParagraphNode {
        const node = new CustomParagraphNode(serializedNode.key_id || null);
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        return node;
    }

    exportJSON(): CustomSerializedParagraphNode {
        return {
            ...super.exportJSON(),
            key_id: this.__key_id || "",
            children: this.getChildren().map((child) => child.exportJSON()),
        };
    }

    exportDOM(editor: LexicalEditor): DOMExportOutput {
        // Let parent handle children and text-align style
        const result = super.exportDOM(editor);
        // Add legacy align attribute for better compatibility with apps like LibreOffice
        const formatType = this.getFormatType();
        if (formatType && result.element instanceof HTMLElement) {
            result.element.setAttribute('align', formatType);
        }
        return result;
    }

    setKeyId(key_id: string): void {
        const writable = this.getWritable();
        writable.__key_id = key_id;
    }

    getKeyId(): string | null {
        return this.__key_id;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config); // Creates the default <p> element
        const className = config.theme['custom-paragraph']; // Get the class from the theme
        if (className) {
            element.className = className; // Apply the custom class
        }
        return element;
    }
}
