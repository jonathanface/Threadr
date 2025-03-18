// AssociationDecoratorPlugin.tsx

import { useCallback, useEffect, useRef } from "react";
import {
    $createPoint,
    $createRangeSelection,
    $getRoot,
    $setSelection,
    ElementNode,
    LexicalNode,
    TextNode,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { SimplifiedAssociation } from "../../../types/Associations";
import styles from "../threadwriter.module.css";
import { generateTextHash } from "../../../constants/constants";
import { ClickData } from "./DocumentClickPlugin";
import { useAssociations } from "../../../hooks/useAssociations";
import { $createAssociationInlineNode, $isAssociationInlineNode, AssociationInlineNode } from "../customNodes/AssociationInlineNode";

// Utility to escape RegExp special characters
const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const AssociationDecoratorPlugin = ({
    isProgrammaticChange,
    customLeftClick,
    customRightClick,
    exclusionList,
    scrollToTop
}: {
    isProgrammaticChange?: React.RefObject<boolean>;
    customLeftClick?: (value: ClickData) => void | undefined;
    customRightClick?: (value: ClickData) => void | undefined;
    exclusionList?: string[];
    scrollToTop?: boolean;
}) => {
    const [editor] = useLexicalComposerContext();
    const previousHashRef = useRef<string | null>(null);
    const { associations } = useAssociations();

    const getAllDescendants = useCallback((node: LexicalNode): LexicalNode[] => {
        const descendants: LexicalNode[] = [];
        if (node instanceof ElementNode) {
            for (const child of node.getChildren()) {
                descendants.push(child);
                descendants.push(...getAllDescendants(child));
            }
        }
        return descendants;
    }, []);

    const findObsoleteDecorators = useCallback((
        root: ElementNode,
        currentAssociations: SimplifiedAssociation[]
    ): AssociationInlineNode[] => {
        // Create a map from association id to association data for quick lookup.
        const currentAssociationMap = new Map<string, SimplifiedAssociation>();
        currentAssociations.forEach(assoc => {
            currentAssociationMap.set(assoc.association_id, assoc);
        });

        const obsoleteNodes: AssociationInlineNode[] = [];
        const nodesToCheck: AssociationInlineNode[] = [];

        // Step 1: Traverse all descendants and collect all association inline nodes
        getAllDescendants(root).forEach((node) => {
            if (node instanceof AssociationInlineNode) {
                nodesToCheck.push(node);  // Collect inline nodes to check later
            }
        });

        // Step 2: Check for obsolete nodes and adjacent non-whitespace text nodes
        nodesToCheck.forEach((node) => {
            const nodeAssocId = node.getAssociationId();
            const currentAssoc = currentAssociationMap.get(nodeAssocId);

            // If the association no longer exists, mark the node for cleanup
            if (!currentAssoc) {
                obsoleteNodes.push(node);
            } else {
                const aliases = currentAssoc.aliases.split(",");
                const nodeText = node.getName().trim();

                // Check if the current node's text no longer matches the association's name or its aliases
                const isTextOutOfSync = (
                    nodeText !== currentAssoc.association_name.trim() &&
                    !aliases.map(alias => alias.trim()).includes(nodeText)
                );

                // Check for adjacent non-whitespace text nodes (post-traversal check)
                const hasAdjacentNonWhitespace = checkAdjacentNonWhitespaceOrPunctuation(node);
                // console.log("out of sync", isTextOutOfSync, "adjacent", hasAdjacentNonWhitespace);
                // If the node's text has changed or if there are adjacent non-whitespace characters, mark it as obsolete
                if (isTextOutOfSync || hasAdjacentNonWhitespace) {
                    obsoleteNodes.push(node);
                }
            }

        });

        return obsoleteNodes;
    }, [getAllDescendants]);

    // Helper function to check for adjacent non-whitespace text nodes
    const checkAdjacentNonWhitespaceOrPunctuation = (node: LexicalNode): boolean => {
        const previousSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();

        // Check if the previous sibling does NOT end with whitespace or allowed punctuation
        const previousDoesNotEndWithWhitespaceOrPunctuation =
            previousSibling instanceof TextNode &&
            !/[\s'"—-…]$/.test(previousSibling.getTextContent().slice(-1)); // Only check the last character
        if (previousSibling && previousDoesNotEndWithWhitespaceOrPunctuation) {
            console.log("issue with", node.getTextContent());
            console.log("prev does not end with white space or allowed punctuation: ", previousSibling.getTextContent().slice(-1));
        }

        // Check if the next sibling does NOT start with whitespace or allowed punctuation
        const nextDoesNotStartWithWhitespaceOrPunctuation =
            nextSibling instanceof TextNode &&
            !/^[\s.,!"'?—-…]/.test(nextSibling.getTextContent().charAt(0)); // Only check the first character
        if (nextSibling && nextDoesNotStartWithWhitespaceOrPunctuation) {
            console.log("issue with", node.getTextContent());
            console.log("next does not start with whitespace or punctuation", nextSibling.getTextContent().charAt(0));
        }

        // Return true if either condition is met (i.e., either previous sibling doesn't end with whitespace/punctuation, 
        // or next sibling doesn't start with whitespace/punctuation)
        return previousDoesNotEndWithWhitespaceOrPunctuation || nextDoesNotStartWithWhitespaceOrPunctuation;
    };

    const processObsoleteAssociations = (node: AssociationInlineNode) => {
        const previousSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();
        // Case 1: If previousSibling is a TextNode and does not end with whitespace
        if (previousSibling instanceof TextNode) {
            const prevText = previousSibling.getTextContent();
            if (prevText.trim() !== "" && !/\s$/.test(prevText)) {
                // Merge with previous sibling if it doesn't end with whitespace
                //console.log("Merging with previous sibling", prevText, node.getName());
                previousSibling.setTextContent(prevText + node.getName());
            } else {
                // Case 2: If previousSibling ends with whitespace, check nextSibling
                console.log("Previous sibling ends with whitespace, checking nextSibling.");
                if (nextSibling instanceof TextNode && !/^\s/.test(nextSibling.getTextContent())) {
                    // Merge with the next sibling if it doesn't start with whitespace
                    //console.log("Merging with next sibling", node.getName(), nextSibling.getTextContent());
                    nextSibling.setTextContent(node.getName() + nextSibling.getTextContent());
                } else {
                    // Case 3: If no valid merge, insert as new TextNode
                    // console.log("Inserting as new TextNode", node.getName());
                    const text = new TextNode(node.getName());
                    node.insertBefore(text);
                }
            }
        } else {
            // Case 4: If no previous sibling, just check nextSibling
            //console.log("No previous sibling, checking next sibling.");
            if (nextSibling instanceof TextNode && !/^\s/.test(nextSibling.getTextContent())) {
                //console.log("Merging with next sibling", node.getName(), nextSibling.getTextContent());
                nextSibling.setTextContent(node.getName() + nextSibling.getTextContent());
            } else {
                // Case 5: No adjacent text node, insert as new TextNode
                //console.log("Inserting as new TextNode", node.getName());
                const text = new TextNode(node.getName());
                node.insertBefore(text);
            }
        }
        // Remove the obsolete node after merging its content
        node.remove();
    }

    // Memoized association processing function
    const processAssociations = useCallback(
        (associations: SimplifiedAssociation[], rootNode: ElementNode, exclusionList?: string[]): void => {
            if (!associations.length) return;

            const obsoleteNodes = findObsoleteDecorators(rootNode, associations);
            const processedNodes = new Set<AssociationInlineNode>();

            obsoleteNodes.forEach(node => {
                if (processedNodes.has(node)) {
                    // Skip nodes that have already been processed
                    return;
                }

                node.hideHovers();
                // Mark the node as processed
                processedNodes.add(node);
                processObsoleteAssociations(node);

            });



            const textNodes: TextNode[] = [];
            const traverse = (node: LexicalNode) => {
                // Only collect TextNodes that are not inline association nodes.
                if (node instanceof TextNode && !$isAssociationInlineNode(node)) {
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

                    const namesToMatch = [association.association_name.trim(), ...aliases].sort((a, b) => b.length - a.length);
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
                            // if ($isAssociationInlineNode(textNode)) {
                            //     console.log("reactivate")
                            //     textNode.reactivate();
                            //     return;
                            // }
                            const currentMatch = match;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const format: number = (textNode as any).getFormat ? (textNode as any).getFormat() : "";
                            const parent = textNode.getParent();
                            if (!(parent instanceof ElementNode)) return;

                            const beforeMatch = textContent.slice(0, currentMatch.index);
                            const matchedText = textContent.slice(
                                currentMatch.index,
                                currentMatch.index + searchFor.length
                            )
                            const afterMatch = textContent.slice(
                                currentMatch.index + searchFor.length
                            );

                            if (beforeMatch) {
                                const beforeNode = new TextNode(beforeMatch);
                                textNode.insertBefore(beforeNode);
                            }

                            const inlineNode = $createAssociationInlineNode(
                                matchedText,
                                association.association_id,
                                association.short_description,
                                association.association_type,
                                association.portrait,
                                customLeftClick,
                                customRightClick,
                                format
                            );
                            textNode.insertBefore(inlineNode);

                            if (afterMatch) {
                                const afterNode = new TextNode(afterMatch);
                                inlineNode.insertAfter(afterNode);
                            } else {
                                const afterNode = new TextNode('');
                                inlineNode.insertAfter(afterNode);
                            }
                            textNode.remove();

                            const nextNode: TextNode | null = inlineNode.getNextSibling();

                            // const inlineTextLength = inlineNode.getTextContent().length;
                            // inlineNode.splitText(inlineTextLength);

                            if (nextNode) {
                                const point = $createPoint(nextNode.getKey(), 1, 'text'); // Set point at the start of the next node
                                const rangeSelection = $createRangeSelection();
                                rangeSelection.anchor = point;
                                rangeSelection.focus = point;
                                $setSelection(rangeSelection);
                                nextNode.setTextContent(nextNode.getTextContent().substring(0));
                            }
                        }
                    }
                });
            });
        },
        [customLeftClick, customRightClick, findObsoleteDecorators]
    );

    // Process associations when associations prop changes (e.g., initial load)
    useEffect(() => {
        if (associations && editor && previousHashRef) {
            // Avoid processing during programmatic changes
            if (isProgrammaticChange?.current) {
                //console.log("AssociationPlugin - Programmatic change in progress, skipping association processing on prop change.");
                return;
            }

            try {
                // Indicate that a programmatic change is starting
                if (isProgrammaticChange) {
                    isProgrammaticChange.current = true;
                }

                editor.update(() => {
                    //console.log("AssociationPlugin - Associations processed on associations prop change.", JSON.stringify(exclusionList), associations);
                    const root = $getRoot();
                    processAssociations(associations, root, exclusionList);
                    //console.log("AssociationPlugin - Associations processed on associations prop change.");
                    if (scrollToTop) {
                        const contentEditableDiv = document.querySelector(`.${styles.editorInput}`);
                        if (contentEditableDiv) {
                            contentEditableDiv.scrollTop = 0;
                        }
                    }

                    previousHashRef.current = generateTextHash(editor);
                    if (isProgrammaticChange) {
                        isProgrammaticChange.current = false;
                    }
                });
            } catch (error) {
                console.error(`AssociationPlugin - Error processing associations on prop change: ${error}`);
            }
        }
    }, [associations, editor, processAssociations, exclusionList, scrollToTop, previousHashRef, isProgrammaticChange]);

    // Listener function for user-initiated editor updates
    const handleUserEditorUpdate = useCallback(() => {
        if (isProgrammaticChange?.current) {
            // If a programmatic change is in progress, skip processing
            console.warn("AssociationPlugin - Skipping user-initiated update due to ongoing programmatic change.");
            return;
        }

        // Generate current text hash
        const currentHash = generateTextHash(editor);
        const previousHash = previousHashRef.current;

        if (currentHash === previousHash) {
            //console.log("AssociationPlugin - No content changes detected, skipping association processing.");
            return;
        }

        // Update the previous hash
        previousHashRef.current = currentHash;

        try {
            // Indicate that a programmatic change is starting
            if (isProgrammaticChange) {
                isProgrammaticChange.current = true;
            }

            editor.update(() => {
                const root = $getRoot();
                processAssociations(associations!, root, exclusionList);
                // console.log("AssociationPlugin - Associations processed on user-initiated update.");
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
