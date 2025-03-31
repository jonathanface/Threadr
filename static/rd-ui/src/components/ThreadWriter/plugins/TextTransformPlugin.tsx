// Here I will put any text replacement I want automatically done on the document

import { useEffect } from "react";
import {
    TextNode,
    $getNodeByKey,
    $isTextNode,
    $createPoint,
    $createRangeSelection,
    $setSelection,
    $getSelection,
    $isRangeSelection
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export const TextTransformPlugin = ({
    isProgrammaticChange
}: {
    isProgrammaticChange?: React.RefObject<boolean>;
}) => {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        // Register a mutation listener on TextNode.
        // The callback fires whenever a TextNode is added/updated/removed.
        return editor.registerMutationListener(TextNode, (mutations) => {
            // Use editor.update() so we can modify node content safely.
            editor.update(() => {
                for (const [nodeKey, mutationType] of mutations) {
                    // We only care about nodes that have changed text (i.e., 'updated').
                    if (mutationType === "updated") {
                        const node = $getNodeByKey(nodeKey);
                        if ($isTextNode(node)) {
                            const originalText = node.getTextContent();

                            if (
                                originalText.includes("--") ||
                                originalText.includes("“") ||
                                originalText.includes("”") ||
                                originalText.includes("‘") ||
                                originalText.includes("’")
                            ) {
                                const selection = $getSelection();
                                if (!$isRangeSelection(selection)) return;
                                if (!$isTextNode(selection?.anchor.getNode())) return;

                                const isFocused = selection?.anchor.getNode().getKey() === node.getKey();
                                const originalOffset = selection?.anchor.offset ?? null;

                                const replaced = originalText
                                    .replace(/--/g, "—")
                                    .replace(/“/g, '"')
                                    .replace(/”/g, '"')
                                    .replace(/‘/g, "'")
                                    .replace(/’/g, "'");

                                if (replaced !== originalText) {
                                    node.setTextContent(replaced);

                                    if (!isProgrammaticChange?.current && isFocused && originalOffset !== null) {
                                        // Calculate new offset by mapping the cursor position through the replacement
                                        let newOffset = originalOffset;

                                        // Handle -- → — specifically
                                        const leftOfCursor = originalText.slice(0, originalOffset);
                                        const leftReplaced = leftOfCursor
                                            .replace(/--/g, "—")
                                            .replace(/“/g, '"')
                                            .replace(/”/g, '"')
                                            .replace(/‘/g, "'")
                                            .replace(/’/g, "'");

                                        newOffset = leftReplaced.length;

                                        const point = $createPoint(node.getKey(), newOffset, "text");
                                        const rangeSelection = $createRangeSelection();
                                        rangeSelection.anchor = point;
                                        rangeSelection.focus = point;
                                        $setSelection(rangeSelection);
                                    }
                                }
                            }
                        }

                    }
                }
            });
        });
    }, [editor, isProgrammaticChange]);
    return null;
}
