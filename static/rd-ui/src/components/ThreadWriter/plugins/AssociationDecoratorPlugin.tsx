import { useCallback, useEffect } from "react";
import {
    $getRoot,
    $getSelection,
    ElementNode,
    LexicalNode,
    TextNode,
    $isRangeSelection,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ClickableDecoratorNode } from "../ClickableDecoratorNode";
import { Association } from "../../../types/Associations";

export const AssociationDecoratorPlugin = ({
    associations,
}: {
    associations: Association[] | null;
}) => {
    const [editor] = useLexicalComposerContext();

    const processAssociations = useCallback((associations: Association[], rootNode: ElementNode) => {
        const textNodes: TextNode[] = [];
        const traverse = (node: LexicalNode) => {
            if (node instanceof TextNode) {
                textNodes.push(node);
            } else if (node instanceof ElementNode) {
                node.getChildren().forEach(traverse);
            }
        };

        rootNode.getChildren().forEach(traverse);

        textNodes.forEach((textNode) => {
            const textContent = textNode.getTextContent();

            associations.forEach((association) => {
                const index = textContent.indexOf(association.association_name);
                if (index !== -1) {
                    editor.update(() => {
                        const parent = textNode.getParent();
                        if (!(parent instanceof ElementNode)) return;

                        const beforeMatch = textContent.slice(0, index);
                        const match = textContent.slice(index, index + association.association_name.length);
                        const afterMatch = textContent.slice(index + association.association_name.length);

                        if (beforeMatch) {
                            const beforeNode = new TextNode(beforeMatch);
                            textNode.insertBefore(beforeNode);
                        }

                        const decoratorNode = new ClickableDecoratorNode(match);
                        textNode.insertBefore(decoratorNode);

                        if (afterMatch) {
                            const afterNode = new TextNode(afterMatch);
                            decoratorNode.insertAfter(afterNode);
                        }

                        textNode.remove();
                    });
                }
            });
        });
    }, [editor]);

    const processCurrentParagraph = useCallback((associations: Association[]) => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const parentParagraph = anchorNode.getParent();
            if (parentParagraph instanceof ElementNode) {
                processAssociations(associations, parentParagraph);
            }
        }
    }, [processAssociations]);

    useEffect(() => {
        if (associations && associations.length > 0) {
            // Initial processing on load
            editor.update(() => {
                const root = $getRoot();
                processAssociations(associations, root);
            });
        }
    }, [associations, editor, processAssociations]);

    useEffect(() => {
        if (associations && associations.length > 0) {
            // Process associations only for the selected paragraph on changes
            const unregister = editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    processCurrentParagraph(associations);
                });
            });

            return () => unregister();
        }
    }, [associations, editor, processCurrentParagraph]);

    return null;
};
