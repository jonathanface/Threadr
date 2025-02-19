import { $getRoot, $isElementNode, $isTextNode, ElementNode, LexicalEditor, SerializedLexicalNode, SerializedTextNode } from "lexical";
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

export const getParagraphIndexByKey = (editor: LexicalEditor | null, key: string): number | null => {
    let result: number | null = null;
    if (!editor) return null;
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

    // Buffer to hold text and its formatting details
    let bufferedTextData: {
        text: string;
        format: number;
        style: string;
        detail: number;
    } | null = null;

    const flushBuffer = () => {
        if (bufferedTextData) {
            mergedChildren.push({
                type: "text",
                version: 1,
                text: bufferedTextData.text,
                format: bufferedTextData.format,
                style: bufferedTextData.style,
                mode: "normal",
                detail: bufferedTextData.detail,
            } as SerializedTextNode);
            bufferedTextData = null;
        }
    };

    children.forEach((child) => {
        if (child.getType() === "clickable-decorator" || $isTextNode(child)) {
            // Extract formatting info if available.
            let childData = {
                text: child.getTextContent(),
                format: 0,
                style: "",
                detail: 0,
            };

            if ($isTextNode(child)) {
                childData = {
                    text: child.getTextContent(),
                    format: child.getFormat(),
                    style: child.getStyle(),
                    detail: child.getDetail(),
                };
            }

            if (!bufferedTextData) {
                // Initialize the buffer with this node's data
                bufferedTextData = { ...childData };
            } else {
                // If formatting matches, merge the text; otherwise, flush the buffer
                if (
                    bufferedTextData.format === childData.format &&
                    bufferedTextData.style === childData.style &&
                    bufferedTextData.detail === childData.detail
                ) {
                    bufferedTextData.text += childData.text;
                } else {
                    flushBuffer();
                    bufferedTextData = { ...childData };
                }
            }
        } else if ($isElementNode(child)) {
            flushBuffer();
            // Recursively serialize child elements
            mergedChildren.push(serializeWithChildren(child as ElementNode));
        } else {
            flushBuffer();
            // For unsupported nodes, you might simply ignore them or handle them differently.
        }
    });

    // Flush any remaining buffered text
    flushBuffer();

    json.children = mergedChildren;
    return json;
};

