import { TreeItem } from "@mui/x-tree-view";
import { Outline, OutlineSection } from "../../types/Outline";
import { Box, Typography } from "@mui/material";
import styles from './outlineeditpanel.module.css'
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { $createParagraphNode, $createTextNode, $getRoot, EditorState, LexicalEditor } from "lexical";
import { useEffect, useRef, useState } from "react";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useSelections } from "../../hooks/useSelections";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AssociationDecoratorPlugin } from "../ThreadWriter/plugins/AssociationDecoratorPlugin";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { ClickData } from "../ThreadWriter/plugins/DocumentClickPlugin";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { ChapterAssignmentPanel } from "../ChapterAssignmentPanel";
import { AssociationInlineNode } from "../ThreadWriter/customNodes/AssociationInlineNode";

interface OutlineEditProps {
    section: OutlineSection;
    onAssociationClick: (data: ClickData) => void;
}

const theme = {
    paragraph: styles.paragraph,
    text: {
        bold: styles.bold,
        italic: styles.italic,
        underline: styles.underline,
        strikethrough: styles.strikethrough,
    },
};

const outlineConfig = {
    namespace: 'OutlineEditor',
    theme,
    nodes: [
        AssociationInlineNode
    ],
    onError: (error: Error) => {
        console.error('Editor error:', error);
    }
}


export const OutlineEditPanel = (props: OutlineEditProps) => {
    const isProgrammaticChange = useRef(false);
    const editorRef = useRef<LexicalEditor | null>(null);
    const [editorReady, setEditorReady] = useState(false);  // State to trigger re-render
    const hasInitialized = useRef(false);
    const { story, setStory } = useSelections();
    const { showLoader, hideLoader } = useLoader();
    const { propagateStoryUpdates } = useSelections();
    const { setAlertState } = useToaster();
    const [isTextFieldActive, setIsTextFieldActive] = useState(false);

    const updateOutline = async (updatedOutline: Outline) => {
        try {
            showLoader();
            const response = await fetch("/api/outline", {
                method: "PUT",
                body: JSON.stringify(updatedOutline),
            });
            if (!response.ok) {
                console.error(response.statusText);
                throw new Error('There was an error updating your outline. Please report this.')
            }
        } catch (error) {
            setAlertState({
                title: "Error",
                message: (error as Error).message,
                severity: AlertToastType.error,
                open: true
            });
        } finally {
            hideLoader();
        }
    };


    const extractTextAndUpdate = (editorState: EditorState) => {
        if (!story) return;
        isProgrammaticChange.current = true;
        let textContent = "";
        editorState.read(() => {
            const root = $getRoot();
            // Assume each child is a paragraph node.
            textContent = root.getChildren()
                .map((node) => node.getTextContent())
                .join("\n");
        });

        // Only update if the text actually changed (trim to ignore insignificant whitespace)
        if (textContent.trim() === props.section.text.trim()) {
            return;
        }
        const newSection = { ...props.section, text: textContent.trim() }
        const updatedStory = { ...story };
        if (updatedStory.outline) {
            const newSectionIndex = story.outline?.findIndex(outline => outline.place === newSection.place);
            if (newSectionIndex !== undefined && newSectionIndex !== -1) {
                const updatedOutline = [...updatedStory.outline]; // Create a new array for immutability
                updatedOutline.splice(newSectionIndex, 1, newSection); // Replace the old section
                updatedStory.outline = updatedOutline;
            }
        } else {
            updatedStory.outline = [newSection];
        }
        setStory(updatedStory);
        propagateStoryUpdates(updatedStory);
        const newOutlineRequest: Outline = {
            storyID: updatedStory.story_id,
            sections: updatedStory.outline
        }
        updateOutline(newOutlineRequest)
        isProgrammaticChange.current = false;
    };

    useEffect(() => {
        if (!editorReady || !editorRef.current) return;
        editorRef.current.update(() => {
            const root = $getRoot();
            root.clear();
            const paragraph = $createParagraphNode();
            const textNode = $createTextNode(props.section.text || "");
            paragraph.append(textNode);
            root.append(paragraph);
        });

        editorRef.current.setEditable(true);
        hasInitialized.current = true;

    }, [editorReady, props.section.text]);

    return (
        <TreeItem className={styles.header} label={props.section.header} itemId={props.section.place.toString()}>
            <Box className={styles.container}>
                <Typography variant="caption" className={styles.description}>{props.section.description}</Typography>
                <LexicalComposer initialConfig={{
                    editable: false,
                    ...outlineConfig,

                    editorState: (lexEditor: LexicalEditor) => {
                        console.log("Lexical editor instance assigned");
                        queueMicrotask(() => {
                            editorRef.current = lexEditor;
                            setEditorReady(true);  // triggers the useEffect
                        });
                    },
                }}>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable spellCheck={false} className={`${styles.editorInput} ${isTextFieldActive ? styles.activeField : styles.inactiveField}`}
                                onKeyDownCapture={(e) => e.stopPropagation()}
                                onFocus={(e) => { e.stopPropagation(); setIsTextFieldActive(true) }}
                                onBlur={() => {
                                    setIsTextFieldActive(false);
                                    if (editorRef.current) {
                                        const editorState = editorRef.current.getEditorState();
                                        extractTextAndUpdate(editorState);
                                    }
                                }} />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <AssociationDecoratorPlugin isProgrammaticChange={isProgrammaticChange} customLeftClick={props.onAssociationClick} />
                </LexicalComposer>
                <ChapterAssignmentPanel section={props.section} />
            </Box>
        </TreeItem>
    );
}