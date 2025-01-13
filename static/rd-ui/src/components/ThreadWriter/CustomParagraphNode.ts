import { EditorConfig, ParagraphNode, SerializedParagraphNode } from "lexical";

export interface SerializedCustomParagraphNode extends SerializedParagraphNode {
    type: "customParagraph";
    customKey: string;
}

export class CustomParagraphNode extends ParagraphNode {
    __customKey: string;

    static getType(): string {
        return "customParagraph";
    }

    static clone(node: CustomParagraphNode): CustomParagraphNode {
        return new CustomParagraphNode(node.__customKey, node.getKey());
    }

    isEmpty() {
        return false; // Always return false, even if the node has no children
    }

    constructor(customKey: string, key?: string) {
        super(key);
        this.__customKey = customKey;
    }

    getCustomKey(): string {
        return this.__customKey;
    }

    setCustomKey(newKey: string): void {
        const writable = this.getWritable();
        (writable as CustomParagraphNode).__customKey = newKey;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config);
        dom.setAttribute("data-custom-key", this.__customKey);
        return dom;
    }

    static importJSON(serializedNode: SerializedCustomParagraphNode): CustomParagraphNode {
        const node = new CustomParagraphNode(serializedNode.customKey);
        node.setFormat(serializedNode.format);
        node.setIndent(serializedNode.indent);
        return node;
    }

    exportJSON(): SerializedCustomParagraphNode {
        return {
            ...super.exportJSON(),
            type: "customParagraph",
            version: 1,
            customKey: this.__customKey,
        };
    }
}
