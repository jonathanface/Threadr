import { DBOperation } from "../types/DBOperations";
import { $getRoot, LexicalEditor, TextNode } from 'lexical';

export const DbOperationQueue: DBOperation[] = [];

const simple32BitHash = (str: string): string => {
    let hash = 0;
    // A simple, fast, 32-bit polynomial rolling hash
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    // Convert the signed 32-bit result to an unsigned base-36 string
    return (hash >>> 0).toString(36);
}

export const generateTextHash = (editor: LexicalEditor): string => {
    let hash = "";
    editor.getEditorState().read(() => {
        const root = $getRoot();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traverseNode = (node: any) => {
            if (typeof node.getKey !== 'function') {
                console.error('Node is missing getKey method:', node);
                return;
            }
            const nodeKey = node.getKey();
            const nodeType = node.getType();
            const textContent = node.getTextContent();

            // Include formatting attributes (e.g., bold, italic)
            const formatAttributes =
                node instanceof TextNode
                    ? JSON.stringify({
                        format: node.getFormat(), // Bitmask for bold, italic, underline, etc.
                        style: node.getStyle(), // Inline styles (e.g., font size, color)
                    })
                    : "";

            // Include node's serialized data in the hash
            hash += `${nodeKey}:${nodeType}:${textContent}:${formatAttributes};`;

            // Recursively process children (if any)
            if (node.getChildren) {
                node.getChildren().forEach(traverseNode);
            }
        };

        traverseNode(root);
    });
    return simple32BitHash(hash);
};