import { EditorConfig, LexicalEditor, NodeKey, ParagraphNode, SerializedParagraphNode } from "lexical";
import { v4 as uuidv4 } from "uuid";
export interface CustomSerializedParagraphNode extends SerializedParagraphNode {
    type: "custom-paragraph";
    version: 1;
    key_id: string;
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
        return node;
    }

    exportJSON(): CustomSerializedParagraphNode {
        const base = super.exportJSON();
        return {
            ...base,
            type: "custom-paragraph",
            version: 1,
            key_id: this.__key_id,
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

    getKeyId(): string {
        return this.__key_id;
    }
    insertNewAfter(): CustomParagraphNode {
        const next = new CustomParagraphNode(); 
        const dir = this.getDirection();
        if (dir) next.setDirection(dir);
        this.insertAfter(next, true);
        return next;
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
