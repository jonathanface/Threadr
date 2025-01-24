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
import styles from "../threadwriter.module.css";

const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const AssociationDecoratorPlugin = ({
    associations,
    customLeftClick,
    exclusionList,
    scrollToTop
}: {
    associations: SimplifiedAssociation[] | null;
    customLeftClick?: () => void | undefined;
    exclusionList?: string[];
    scrollToTop?: boolean;
}) => {
    const [editor] = useLexicalComposerContext();

    const processAssociations = useCallback(async (associations: SimplifiedAssociation[], rootNode: ElementNode, exclusionList?: string[]): Promise<void> => {
        return new Promise((resolve) => {


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

            textNodes.forEach((textNode, textNodeIndex) => {
                const textContent = textNode.getTextContent();

                associations.forEach((association) => {
                    const aliases = association.aliases.length ? association.aliases.split(",") : [];
                    aliases.sort((a, b) => b.length - a.length);
                    const namesToMatch = [...aliases, association.association_name];
                    for (const name of namesToMatch) {
                        if (exclusionList?.includes(name)) {
                            continue;
                        }
                        const searchText = association.case_sensitive
                            ? textContent
                            : textContent.toLowerCase();
                        const searchFor = association.case_sensitive
                            ? name.trim()
                            : name.trim().toLowerCase();

                        const regex = new RegExp(`\\b${escapeRegExp(searchFor)}\\b`, "g");
                        let match: RegExpExecArray | null;
                        while ((match = regex.exec(searchText)) !== null) {
                            const currentMatch = match;
                            editor.update(() => {
                                const parent = textNode.getParent();
                                if (!(parent instanceof ElementNode)) return;

                                const beforeMatch = textContent.slice(0, currentMatch.index);
                                const matchedText = textContent.slice(currentMatch.index, currentMatch.index + searchFor.length); // Use a different name here
                                const afterMatch = textContent.slice(currentMatch.index + searchFor.length);

                                if (beforeMatch) {
                                    const beforeNode = new TextNode(beforeMatch);
                                    textNode.insertBefore(beforeNode);
                                }
                                const decoratorNode = new ClickableDecoratorNode(
                                    matchedText,
                                    association.association_id,
                                    association.short_description,
                                    association.association_type,
                                    association.portrait,
                                    undefined,
                                    customLeftClick
                                );
                                textNode.insertBefore(decoratorNode);

                                if (afterMatch) {
                                    const afterNode = new TextNode(afterMatch);
                                    decoratorNode.insertAfter(afterNode);
                                }

                                textNode.remove();
                                decoratorNode.selectEnd();
                            });

                            break; // Stop processing after the first match for this association
                        }
                    }
                    if (textNodeIndex === textNodes.length - 1) {
                        resolve();
                    }
                });
            });
        });
    }, [editor, associations]);

    const processCurrentParagraph = useCallback((associations: SimplifiedAssociation[], exclusionList?: string[]) => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const parentParagraph = anchorNode.getParent();
            if (parentParagraph instanceof ElementNode) {
                processAssociations(associations, parentParagraph, exclusionList);
            }
        }
    }, [processAssociations, exclusionList]);

    useEffect(() => {
        const processTextAndScroll = async () => {
            if (associations && associations.length) {
                await editor.update(async () => {
                    const root = $getRoot();
                    await processAssociations(associations, root, exclusionList);

                    if (scrollToTop) {
                        const contentEditableDiv = document.querySelector(`.${styles.editorInput}`);
                        if (contentEditableDiv) {
                            contentEditableDiv.scrollTop = 0;
                        }
                    }
                });
            }
        };
        processTextAndScroll();
    }, [associations, editor, processAssociations, exclusionList]);

    useEffect(() => {
        if (associations && associations.length) {
            // Process associations only for the selected paragraph on changes
            const unregister = editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    processCurrentParagraph(associations, exclusionList);
                });
            });

            return () => unregister();
        }
    }, [associations, editor, processCurrentParagraph]);

    return null;
};
