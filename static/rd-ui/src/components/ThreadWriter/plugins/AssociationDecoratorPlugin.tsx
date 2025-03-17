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

        getAllDescendants(root).forEach((node) => {
            if (node instanceof AssociationInlineNode) {
                const nodeAssocId = node.getAssociationId();
                const currentAssoc = currentAssociationMap.get(nodeAssocId);

                // If the association no longer exists, mark the node for cleanup
                if (!currentAssoc) {
                    obsoleteNodes.push(node);
                } else {
                    const aliases = currentAssoc.aliases.split(",");
                    // if (node.getName().indexOf('hou') > -1) {
                    //     console.log("checking", node.getName(), currentAssoc.association_name, aliases);
                    // }

                    if (
                        (node.getName().trim() !== currentAssoc.association_name && !aliases.map(alias => alias.trim()).includes(node.getName().trim())) ||
                        node.getShortDescription() !== currentAssoc.short_description ||
                        node.getPortrait() !== currentAssoc.portrait
                    ) {
                        // Mark the node for cleanup if the data is stale
                        obsoleteNodes.push(node);
                    }
                }
            }
        });

        return obsoleteNodes;
    }, [getAllDescendants]);


    // Memoized association processing function
    const processAssociations = useCallback(
        (associations: SimplifiedAssociation[], rootNode: ElementNode, exclusionList?: string[]): void => {
            if (!associations.length) return;

            const obsoleteNodes = findObsoleteDecorators(rootNode, associations);
            obsoleteNodes.forEach(node => {
                node.hideHovers();
                const text = new TextNode(node.getName());
                node.replace(text);
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
                                const afterNode = new TextNode(' ');
                                console.log("appending", afterNode.getKey())
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
