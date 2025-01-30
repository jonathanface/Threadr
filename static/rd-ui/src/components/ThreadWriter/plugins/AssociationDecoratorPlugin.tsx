// AssociationDecoratorPlugin.tsx

import { useCallback, useEffect, useRef } from "react";
import {
    $getRoot,
    ElementNode,
    LexicalNode,
    TextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ClickableDecoratorNode } from "../customNodes/ClickableDecoratorNode";
import { SimplifiedAssociation } from "../../../types/Associations";
import styles from "../threadwriter.module.css";

// Utility to escape RegExp special characters
const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Function to generate a text hash based on editor content
const generateTextHash = (editor: LexicalEditor): string => {
    let hash = "";

    editor.getEditorState().read(() => {
        const root = $getRoot();
        const traverseNode = (node: LexicalNode) => {
            if (node instanceof TextNode) {
                const textContent = node.getTextContent();
                const formatAttributes = JSON.stringify({
                    format: node.getFormat(), // Bitmask for bold, italic, etc.
                    style: node.getStyle(),   // Inline styles like color, font-size
                });
                hash += `${node.getKey()}:${node.getType()}:${textContent}:${formatAttributes};`;
            } else if (node instanceof ElementNode) {
                node.getChildren().forEach(traverseNode);
            }
        };
        root.getChildren().forEach(traverseNode);
    });

    return hash;
};

export const AssociationDecoratorPlugin = ({
    associations,
    isProgrammaticChange,
    customLeftClick,
    exclusionList,
    scrollToTop
}: {
    associations: SimplifiedAssociation[] | null;
    isProgrammaticChange?: React.RefObject<boolean>;
    customLeftClick?: () => void | undefined;
    exclusionList?: string[];
    scrollToTop?: boolean;
}) => {
    const [editor] = useLexicalComposerContext();

    // Ref to store the previous text hash
    const previousTextHashRef = useRef<string | null>(null);

    // Memoized association processing function
    const processAssociations = useCallback(
        (associations: SimplifiedAssociation[], rootNode: ElementNode, exclusionList?: string[]): void => {
            if (!associations.length) return;

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
                    const aliases = association.aliases.length
                        ? association.aliases.split(",").map(alias => alias.trim())
                        : [];
                    aliases.sort((a, b) => b.length - a.length); // Match longer aliases first
                    const namesToMatch = [...aliases, association.association_name.trim()];

                    for (const name of namesToMatch) {
                        if (exclusionList?.includes(name)) {
                            continue;
                        }

                        const searchText = association.case_sensitive
                            ? textContent
                            : textContent.toLowerCase();
                        const searchFor = association.case_sensitive
                            ? name
                            : name.toLowerCase();

                        const regex = new RegExp(`\\b${escapeRegExp(searchFor)}\\b`, "g");
                        let match: RegExpExecArray | null;

                        while ((match = regex.exec(searchText)) !== null) {
                            const currentMatch = match;

                            const parent = textNode.getParent();
                            if (!(parent instanceof ElementNode)) return;

                            const beforeMatch = textContent.slice(0, currentMatch.index);
                            const matchedText = textContent.slice(
                                currentMatch.index,
                                currentMatch.index + searchFor.length
                            );
                            const afterMatch = textContent.slice(
                                currentMatch.index + searchFor.length
                            );

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
                            break; // Stop processing after the first match for this association
                        }
                    }
                });
            });
        },
        [customLeftClick, exclusionList]
    );

    // Process associations when associations prop changes (e.g., initial load)
    useEffect(() => {
        if (associations && associations.length && editor) {
            // Avoid processing during programmatic changes
            if (isProgrammaticChange?.current) {
                console.log("AssociationPlugin - Programmatic change in progress, skipping association processing on prop change.");
                return;
            }

            try {
                // Indicate that a programmatic change is starting
                if (isProgrammaticChange) {
                    isProgrammaticChange.current = true;
                }

                editor.update(() => {
                    const root = $getRoot();
                    processAssociations(associations, root, exclusionList);
                    console.log("AssociationPlugin - Associations processed on associations prop change.");
                    if (scrollToTop) {
                        const contentEditableDiv = document.querySelector(`.${styles.editorInput}`);
                        if (contentEditableDiv) {
                            contentEditableDiv.scrollTop = 0;
                        }
                    }
                });
            } catch (error) {
                console.error(`AssociationPlugin - Error processing associations on prop change: ${error}`);
            } finally {
                // Reset the programmatic change flag
                if (isProgrammaticChange) {
                    isProgrammaticChange.current = false;
                }
            }
        }
    }, [associations, editor, processAssociations, exclusionList, scrollToTop, isProgrammaticChange]);

    // Listener function for user-initiated editor updates
    const handleUserEditorUpdate = useCallback(({ editorState }: { editorState: any }) => {
        if (isProgrammaticChange?.current) {
            // If a programmatic change is in progress, skip processing
            console.warn("AssociationPlugin - Skipping user-initiated update due to ongoing programmatic change.");
            return;
        }

        // Generate current text hash
        const currentHash = generateTextHash(editor);
        const previousHash = previousTextHashRef.current;

        console.log("AssociationPlugin - Current Text Hash:", currentHash);
        console.log("AssociationPlugin - Previous Text Hash:", previousHash);

        if (currentHash === previousHash) {
            console.log("AssociationPlugin - No content changes detected, skipping association processing.");
            return;
        }

        // Update the previous hash
        previousTextHashRef.current = currentHash;

        try {
            // Indicate that a programmatic change is starting
            if (isProgrammaticChange) {
                isProgrammaticChange.current = true;
            }

            editor.update(() => {
                const root = $getRoot();
                processAssociations(associations!, root, exclusionList);
                console.log("AssociationPlugin - Associations processed on user-initiated update.");
                if (scrollToTop) {
                    const contentEditableDiv = document.querySelector(`.${styles.editorInput}`);
                    if (contentEditableDiv) {
                        contentEditableDiv.scrollTop = 0;
                    }
                }
            });
        } catch (error) {
            console.error(`AssociationPlugin - Error processing associations on user update: ${error}`);
        } finally {
            // Reset the programmatic change flag
            if (isProgrammaticChange) {
                isProgrammaticChange.current = false;
            }
        }
    }, [associations, editor, processAssociations, exclusionList, scrollToTop, isProgrammaticChange]);

    // Register the user-initiated update listener with Lexical editor
    useEffect(() => {
        if (associations && associations.length && editor) {
            const unregister = editor.registerUpdateListener(handleUserEditorUpdate);
            return () => unregister();
        }
    }, [associations, editor, handleUserEditorUpdate]);

    return null;
};
