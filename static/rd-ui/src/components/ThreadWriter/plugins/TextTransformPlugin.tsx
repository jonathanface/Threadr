// Here I will put any text replacement I want automatically done on the document

import { useEffect } from "react";
import {
    TextNode,
    $getNodeByKey,
    $isTextNode
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export function TextTransformPlugin() {
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
                            const textContent = node.getTextContent();
                            if (
                                textContent.includes("--") ||
                                textContent.includes("“") ||
                                textContent.includes("”") ||
                                textContent.includes("‘") ||
                                textContent.includes("’")
                            ) {
                                const replaced = textContent
                                    .replace(/--/g, "—")
                                    .replace(/“/g, '"')
                                    .replace(/”/g, '"')
                                    .replace(/‘/g, "'")
                                    .replace(/’/g, "'");
                                node.setTextContent(replaced);
                            }
                        }
                    }
                }
            });
        });
    }, [editor]);
    return null;
}
