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
import { ClickableDecoratorNode } from "../customNodes/ClickableDecoratorNode";
import { SimplifiedAssociation } from "../../../types/Associations";

export const AssociationDecoratorPlugin = ({
    associations,
}: {
    associations: SimplifiedAssociation[] | null;
}) => {
    const [editor] = useLexicalComposerContext();

    const processAssociations = useCallback((associations: SimplifiedAssociation[], rootNode: ElementNode) => {
        if (!associations.length) {
            return;
        }
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
                const aliases = association.aliases.length ? association.aliases.split(",") : [];
                aliases.sort((a, b) => a.length - b.length);
                const namesToMatch = [...aliases, association.association_name];
                for (const name of namesToMatch) {
                    const searchText = association.case_sensitive
                        ? textContent
                        : textContent.toLowerCase();
                    const searchFor = association.case_sensitive
                        ? name.trim()
                        : name.trim().toLowerCase();

                    const index = searchText.indexOf(searchFor);
                    if (index !== -1) {
                        editor.update(() => {
                            const parent = textNode.getParent();
                            if (!(parent instanceof ElementNode)) return;

                            const beforeMatch = textContent.slice(0, index);
                            const match = textContent.slice(index, index + searchFor.length);
                            const afterMatch = textContent.slice(index + searchFor.length);

                            if (beforeMatch) {
                                const beforeNode = new TextNode(beforeMatch);
                                textNode.insertBefore(beforeNode);
                            }
                            const decoratorNode = new ClickableDecoratorNode(match, association.association_id, association.short_description, association.association_type, association.portrait);
                            textNode.insertBefore(decoratorNode);

                            if (afterMatch) {
                                const afterNode = new TextNode(afterMatch);
                                decoratorNode.insertAfter(afterNode);
                            }

                            textNode.remove();
                            decoratorNode.selectEnd();
                        });
                        break;
                    }
                }
            });
        });
    }, [editor]);

    const processCurrentParagraph = useCallback((associations: SimplifiedAssociation[]) => {
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
        if (associations && associations.length) {
            // Initial processing on load
            editor.update(() => {
                const root = $getRoot();
                processAssociations(associations, root);
            });
        }
    }, [associations, editor, processAssociations]);

    useEffect(() => {
        if (associations && associations.length) {
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
