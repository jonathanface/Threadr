import { useEffect } from "react";
import { $getRoot, ElementNode, LexicalEditor, LexicalNode, TextNode } from "lexical";
import { ClickableDecoratorNode } from "../ClickableDecoratorNode";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { Association } from "../../../types/Associations";

export const AssociationDecoratorPlugin = ({ associations }: { associations: Association[] | null }) => {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (associations !== null) {
            const registerTextMatches = (editor: LexicalEditor) => {
                return editor.registerUpdateListener(({ editorState }) => {
                    editorState.read(() => {
                        const root = $getRoot();
                        const textNodes: TextNode[] = [];

                        const traverse = (node: LexicalNode) => {
                            if (node instanceof TextNode) {
                                textNodes.push(node);
                            } else if (node instanceof ElementNode) {
                                // Ensure the node is an ElementNode before calling getChildren
                                node.getChildren().forEach(traverse);
                            }
                        };

                        root.getChildren().forEach(traverse);

                        editor.update(() => {
                            textNodes.forEach((textNode) => {
                                const textContent = textNode.getTextContent();

                                associations.forEach((association) => {
                                    const index = textContent.indexOf(association.association_name);

                                    if (index !== -1) {
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
                                            textNode.insertAfter(afterNode);
                                        }

                                        textNode.remove();
                                    }
                                });
                            });
                        });
                    });
                });
            };

            const unregister = registerTextMatches(editor);

            return () => unregister();
        }
    }, [associations, editor]);

    return null;
};
