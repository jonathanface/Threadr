import { LexicalEditor, ParagraphNode, SerializedParagraphNode } from "lexical";

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

    exportDOM(editor: LexicalEditor): { element: HTMLElement } {
        const element = document.createElement("p");

        // Iterate over child nodes and append their content
        const children = this.getChildren();
        children.forEach((child) => {
            const { element: childElement } = child.exportDOM(editor);
            if (childElement) {
                element.appendChild(childElement);
            }
        });

        return { element };
    }

    setKeyId(key_id: string): void {
        const writable = this.getWritable();
        writable.__key_id = key_id;
    }

    getKeyId(): string | null {
        return this.__key_id;
    }
}
