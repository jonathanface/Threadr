// AssociationDecoratorPlugin.tsx

import { useCallback, useEffect, useRef } from "react";
import {
    $createPoint,
    $createRangeSelection,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
    ElementNode,
    FORMAT_TEXT_COMMAND,
    LexicalNode,
    TextFormatType,
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

                // Handle case sensitivity properly
                const formattedAliases = currentAssoc.case_sensitive
                    ? aliases.map(alias => alias.trim())
                    : aliases.map(alias => alias.trim().toLowerCase());

                const associationName = currentAssoc.case_sensitive
                    ? currentAssoc.association_name.trim()
                    : currentAssoc.association_name.trim().toLowerCase();

                // Check if the current node's text no longer matches the association's name or its aliases

                const enteredText = currentAssoc.case_sensitive ? nodeText : nodeText.toLowerCase();
                const isTextOutOfSync = (
                    enteredText !== associationName &&
                    !(formattedAliases.includes(enteredText))
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
            // eslint-disable-next-line no-useless-escape
            !/[\s.,:;"'’“…—–\-]$/.test(previousSibling.getTextContent().slice(-1)); // Only check the last character
        if (previousSibling && previousDoesNotEndWithWhitespaceOrPunctuation) {
            console.log("issue with", node.getTextContent());
            console.log("prev does not end with white space or allowed punctuation: ", previousSibling.getTextContent().slice(-1));
        }

        // Check if the next sibling does NOT start with whitespace or allowed punctuation
        const nextDoesNotStartWithWhitespaceOrPunctuation =
            nextSibling instanceof TextNode &&
            // eslint-disable-next-line no-useless-escape
            !/^[\s.,:;!"'’“?…—–\-]/.test(nextSibling.getTextContent().charAt(0)); // Only check the first character
        if (nextSibling && nextDoesNotStartWithWhitespaceOrPunctuation) {
            console.log("issue with", node.getTextContent());
            console.log("next does not start with whitespace or punctuation", nextSibling.getTextContent().charAt(0));
        }

        // Return true if either condition is met (i.e., either previous sibling doesn't end with whitespace/punctuation, 
        // or next sibling doesn't start with whitespace/punctuation)
        return previousDoesNotEndWithWhitespaceOrPunctuation || nextDoesNotStartWithWhitespaceOrPunctuation;
    };

    const processObsoleteAssociations = (node: AssociationInlineNode): void => {
        if (!node.isAttached()) return;

        const previousSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const format: number = (node as any).getFormat ? (node as any).getFormat() : 0;
        const nodeText = node.getName();

        let merged = false;

        // Case 1: Try merging with previous sibling if it is a TextNode.
        if (previousSibling instanceof TextNode) {
            const prevText = previousSibling.getTextContent();
            if (prevText.trim() !== "" && !/\s$/.test(prevText)) {
                // Only merge if the previous text does NOT already end with the nodeText.
                if (!prevText.endsWith(nodeText)) {
                    //console.log("Merging with previous sibling", prevText, nodeText);
                    previousSibling.setTextContent(prevText + nodeText);
                } else {
                    //console.log("Previous sibling already merged with node text");
                }
                merged = true;
            }
        }

        // Case 2: If not merged with previous, try merging with next sibling.
        if (!merged && nextSibling instanceof TextNode) {
            const nextText = nextSibling.getTextContent();
            if (!/^\s/.test(nextText)) {
                if (!nextText.startsWith(nodeText)) {
                    //console.log("Merging with next sibling", nodeText, nextText);
                    nextSibling.setTextContent(nodeText + nextText);
                } else {
                    //console.log("Next sibling already merged with node text");
                }
                merged = true;
            }
        }

        // If a merge occurred, remove the obsolete node and exit.
        if (merged) {
            node.remove();
            return;
        }

        // Case 3: If no merge occurred, insert a new TextNode with the node's text.
        //console.log("Inserting as new TextNode", nodeText);
        const newNode = new TextNode(nodeText);
        newNode.setFormat(format);
        node.insertBefore(newNode);
        node.remove();
    };


    // Memoized association processing function
    const processAssociations = useCallback(
        (
            associations: SimplifiedAssociation[],
            rootNode: ElementNode,
            exclusionList?: string[]
        ): void => {
            if (!associations.length) return;

            // Process obsolete inline nodes.
            const obsoleteNodes = findObsoleteDecorators(rootNode, associations);
            const processedNodes = new Set<AssociationInlineNode>();
            obsoleteNodes.forEach((node) => {
                if (processedNodes.has(node)) return;
                node.hideHovers();
                processedNodes.add(node);
                processObsoleteAssociations(node);
            });

            // Collect all TextNodes that are not inline association nodes.
            const textNodes: TextNode[] = [];
            const traverse = (node: LexicalNode): void => {
                if (node instanceof TextNode && !$isAssociationInlineNode(node)) {
                    textNodes.push(node);
                } else if (node instanceof ElementNode) {
                    node.getChildren().forEach(traverse);
                }
            };
            rootNode.getChildren().forEach(traverse);

            // Process each TextNode.
            textNodes.forEach((textNode) => {
                const originalText = textNode.getTextContent();
                if (!originalText) return;
                // Get the text node's format.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const format: number = (textNode as any).getFormat ? (textNode as any).getFormat() : 0;

                // Determine if this textNode is currently selected and store its offset.
                let originalSelectionOffset: number | null = null;
                const selection = $getSelection();
                if ($isRangeSelection(selection) && selection.anchor.getNode() === textNode) {
                    originalSelectionOffset = selection.anchor.offset;
                }

                // Collect all matches from the original text.
                type MatchInfo = {
                    start: number;
                    end: number;
                    association: SimplifiedAssociation;
                    searchFor: string;
                };
                const matches: MatchInfo[] = [];
                associations.forEach((association) => {
                    const aliases =
                        association.aliases.length > 0
                            ? association.aliases.split(",").map((alias) => alias.trim())
                            : [];

                    const namesToMatch = Array.from(new Set([
                        association.association_name.trim(),
                        ...aliases,
                    ])).sort((a, b) => b.length - a.length);
                    namesToMatch.forEach((name) => {
                        if (exclusionList?.includes(name)) return;
                        const searchText = association.case_sensitive
                            ? originalText
                            : originalText.toLowerCase();
                        const searchFor = association.case_sensitive
                            ? name
                            : name.toLowerCase();
                        //if (searchText === 'Ash') {
                        //console.log("searchText", searchText, "searchFor", searchFor);
                        //}
                        const regex = new RegExp(`\\b${escapeRegExp(searchFor)}\\b`, "g");
                        let match: RegExpExecArray | null;
                        while ((match = regex.exec(searchText)) !== null) {
                            matches.push({
                                start: match.index,
                                end: match.index + searchFor.length,
                                association,
                                searchFor,
                            });
                        }
                    });
                });

                if (matches.length === 0) return;

                // Sort matches in descending order (so later modifications don't affect earlier offsets).
                matches.sort((a, b) => b.start - a.start);

                // Remove the original text node.
                const parent = textNode.getParent();
                if (!(parent instanceof ElementNode)) return;
                textNode.remove();

                // Build new nodes by processing matches in reverse order.
                const newNodes: LexicalNode[] = [];
                let currentIndex = originalText.length;
                matches.forEach((match) => {
                    // Text after the match (from match.end to currentIndex)
                    const afterText = originalText.slice(match.end, currentIndex);
                    if (afterText.length > 0) {
                        const afterNode = new TextNode(afterText);
                        afterNode.setFormat(format);
                        newNodes.unshift(afterNode);
                    }
                    // Create the inline association node.
                    const matchedText = originalText.slice(match.start, match.end);
                    const inlineNode = $createAssociationInlineNode(
                        matchedText,
                        match.association.association_id,
                        match.association.short_description,
                        match.association.association_type,
                        match.association.portrait,
                        customLeftClick,
                        customRightClick,
                        format
                    );
                    newNodes.unshift(inlineNode);
                    // Update currentIndex for the next iteration.
                    currentIndex = match.start;
                });
                // Add any remaining text before the first match.
                if (currentIndex > 0) {
                    const beforeText = originalText.slice(0, currentIndex);
                    if (beforeText.length > 0) {
                        const beforeNode = new TextNode(beforeText);
                        beforeNode.setFormat(format);
                        newNodes.unshift(beforeNode);
                    }
                }

                // Insert the new nodes into the parent in order.
                newNodes.forEach((node) => {
                    parent.append(node);
                });

                // Restore selection: if the original text node was selected, compute the new selection position.
                if (originalSelectionOffset !== null) {
                    let cumulativeLength = 0;
                    let newAnchorNode: TextNode | null = null;
                    let newOffset = 0;
                    // Iterate through newNodes in order (left-to-right).
                    for (const node of newNodes) {
                        const nodeText = node.getTextContent();
                        if (cumulativeLength + nodeText.length >= originalSelectionOffset) {
                            if (node instanceof TextNode) {
                                newAnchorNode = node;
                                newOffset = originalSelectionOffset - cumulativeLength;
                            } else {
                                // If the node is inline, use its length as well.
                                newAnchorNode = null;
                            }
                            break;
                        }
                        cumulativeLength += nodeText.length;
                    }
                    if (newAnchorNode) {
                        const point = $createPoint(newAnchorNode.getKey(), newOffset, "text");
                        const rangeSelection = $createRangeSelection();
                        rangeSelection.anchor = point;
                        rangeSelection.focus = point;
                        $setSelection(rangeSelection);
                    }
                }
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

    useEffect(() => {
        editor.registerCommand(
            FORMAT_TEXT_COMMAND,
            (format: TextFormatType) => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    // Iterate over nodes in the selection.
                    selection.getNodes().forEach((node) => {
                        if ($isAssociationInlineNode(node)) {
                            // Update the inline node's format with the new format.
                            node.setFormatAndReplace(format);
                            node.markDirty();
                        }
                    });
                }
                // Let the command propagate normally.
                return false;
            },
            3
        );
    }, [editor]);

    return null;
};
