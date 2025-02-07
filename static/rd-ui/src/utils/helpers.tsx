import { $getRoot, $isElementNode, $isTextNode, EditorState, ElementNode, SerializedLexicalNode, SerializedTextNode } from "lexical";
import { Story } from "../types/Story";
import { CustomParagraphNode, CustomSerializedParagraphNode } from "../components/ThreadWriter/customNodes/CustomParagraphNode";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isStory = (obj: any): obj is Story => {
    return (
        obj &&
        typeof obj.story_id === "string" &&
        (typeof obj.created_at === "number" ||
            typeof obj.created_at === "undefined") &&
        typeof obj.title === "string" &&
        typeof obj.description === "string" &&
        (typeof obj.series_id === "string" ||
            typeof obj.series_id === "undefined") &&
        Array.isArray(obj.chapters) &&
        (typeof obj.place === "number" || obj.place === "undefined") &&
        typeof obj.image_url === "string"
    );
};

export const getParagraphIndexByKey = (editor: EditorState, key: string): number | null => {
    let result: number | null = null;
    editor.read(() => {
        const root = $getRoot();
        const children = root.getChildren<ElementNode>();

        for (let index = 0; index < children.length; index++) {
            const node = children[index];
            if (node.getType() === CustomParagraphNode.getType() && node.getKey() === key) {
                result = index;
                break;
            }
        }
    });
    return result;
};

export const serializeWithChildren = (node: ElementNode): CustomSerializedParagraphNode => {
    if (!(node instanceof CustomParagraphNode)) {
        throw new Error("Node is not an instance of CustomParagraphNode");
    }

    const json = node.exportJSON() as CustomSerializedParagraphNode;

    const children = node.getChildren();
    const mergedChildren: SerializedLexicalNode[] = [];

    let bufferText = ""; // Buffer to accumulate text from `clickable-decorator` and `text` nodes

    children.forEach((child) => {
        if (child.getType() === "clickable-decorator" || $isTextNode(child)) {
            // Accumulate text from both `clickable-decorator` and `text` nodes
            bufferText += child.getTextContent();
        } else if ($isElementNode(child)) {
            // Serialize nested child elements
            if (bufferText) {
                // If there's buffered text, create a text node for it
                mergedChildren.push({
                    type: "text",
                    version: 1,
                    text: bufferText,
                    format: 0,
                    style: "",
                    mode: "normal",
                    detail: 0,
                } as SerializedTextNode);
                bufferText = ""; // Clear the buffer
            }
            mergedChildren.push(serializeWithChildren(child as ElementNode)); // Recursively serialize child element
        } else {
            // If it's an unsupported node, flush buffer and skip
            if (bufferText) {
                mergedChildren.push({
                    type: "text",
                    version: 1,
                    text: bufferText,
                    format: 0,
                    style: "",
                    mode: "normal",
                    detail: 0,
                } as SerializedTextNode);
                bufferText = ""; // Clear the buffer
            }
        }
    });

    // Add any remaining buffered text as a final text node
    if (bufferText) {
        mergedChildren.push({
            type: "text",
            version: 1,
            text: bufferText,
            format: 0,
            style: "",
            mode: "normal",
            detail: 0,
        } as SerializedTextNode);
    }

    json.children = mergedChildren;

    return json;
};
