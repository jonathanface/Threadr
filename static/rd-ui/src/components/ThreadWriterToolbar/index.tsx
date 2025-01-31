import { useEffect, useMemo, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    FORMAT_TEXT_COMMAND,
    FORMAT_ELEMENT_COMMAND,
    $getSelection,
    $isRangeSelection,
    TextFormatType,
    ElementFormatType,
} from "lexical";
import IconButton from '@mui/material/IconButton';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import styles from "./toolbar.module.css";
import { DocumentExporter } from "./DocumentExporter";
import { EditableText } from "../EditableText";
import { useSelections } from "../../hooks/useSelections";
import { AlertToastType } from "../../types/AlertToasts";
import { useToaster } from "../../hooks/useToaster";

export const Toolbar = () => {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [alignment, setAlignment] = useState<string | null>("left");

    const { story, chapter, series, setChapter, setStory, setSeries } = useSelections();
    const { setAlertState } = useToaster();

    const toggleTextFormat = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    const applyAlignment = (alignment: ElementFormatType) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
    };

    const alignmentMap = useMemo<Record<number, ElementFormatType>>(() => ({
        1: "left",
        2: "center",
        3: "right",
        4: "justify",
    }), []);

    useEffect(() => {
        const updateToolbar = () => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    setIsBold(selection.hasFormat("bold"));
                    setIsItalic(selection.hasFormat("italic"));
                    setIsUnderline(selection.hasFormat("underline"));
                    setIsStrikethrough(selection.hasFormat("strikethrough"));
                    const anchorNode = selection.anchor.getNode();
                    const parentNode = anchorNode.getType() === "custom-paragraph" ? anchorNode : anchorNode.getParent();
                    if (parentNode?.getType() === "custom-paragraph") {
                        const format = parentNode.getFormat(); // Use parentNode here
                        const alignmentValue = alignmentMap[format] || "left";
                        setAlignment(alignmentValue);
                    } else {
                        setAlignment("left");
                    }
                }
            });
        };

        const unsubscribe = editor.registerUpdateListener(() => {
            updateToolbar();
        });

        return () => unsubscribe();
    }, [editor, alignmentMap]);

    const onChapterTitleEdit = async (event: React.SyntheticEvent) => {
        if (story && chapter) {
            const target = event.target as HTMLInputElement;
            if (target.value !== chapter.title && target.value.trim() !== "") {
                const updatedChapter = { ...chapter };
                updatedChapter.title = target.value;
                try {
                    const response = await fetch("/api/stories/" + story.story_id + "/chapters/" + chapter.id, {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(updatedChapter),
                    });
                    if (!response.ok) {
                        console.error(response.body);
                        throw new Error('There was an error updating your chapter. Please report this.');
                    }
                    setChapter(updatedChapter);
                    const idx = story.chapters.findIndex(chap => { chapter.id === chap.id });
                    if (idx !== -1) {
                        const newStory = { ...story };
                        const newChapters = [...newStory.chapters];
                        newChapters[idx] = updatedChapter;
                        newStory.chapters = newChapters;
                        setStory(newStory);
                        if (series) {
                            const seriesIDX = series.stories.findIndex(story => story.story_id === story.story_id);
                            if (seriesIDX !== -1) {
                                const newStoriesList = { ...series.stories };
                                newStoriesList[seriesIDX] = newStory;
                                const newSeries = { ...series };
                                newSeries.stories = newStoriesList;
                                setSeries(newSeries);
                            }
                        }
                    }
                } catch (error: unknown) {
                    setAlertState({
                        title: "Error",
                        message: (error as Error).message,
                        severity: AlertToastType.error,
                        open: true,
                        timeout: 6000,
                    });
                }
            }
        }
    };

    return (
        <div className={styles.toolbar}>
            {/* Text formatting buttons */}
            <button
                className={isBold ? styles.active : ""}
                onClick={() => toggleTextFormat("bold")}
            >
                <b>B</b>
            </button>
            <button
                className={isItalic ? styles.active : ""}
                onClick={() => toggleTextFormat("italic")}
            >
                <i>I</i>
            </button>
            <button
                className={isUnderline ? styles.active : ""}
                onClick={() => toggleTextFormat("underline")}
            >
                <u>U</u>
            </button>
            <button
                className={isStrikethrough ? styles.active : ""}
                onClick={() => toggleTextFormat("strikethrough")}
            >
                <s>S</s>
            </button>

            {/* Alignment buttons */}
            <IconButton className={alignment === 'left' ? styles.active : ""} aria-label="left" onClick={() => applyAlignment("left")}>
                <FormatAlignLeftIcon fontSize="small" />
            </IconButton>
            <IconButton className={alignment === 'center' ? styles.active : ""} aria-label="center" onClick={() => applyAlignment("center")}>
                <FormatAlignCenterIcon fontSize="small" />
            </IconButton>
            <IconButton className={alignment === 'right' ? styles.active : ""} aria-label="right" onClick={() => applyAlignment("right")}>
                <FormatAlignRightIcon fontSize="small" />
            </IconButton>
            <IconButton className={alignment === 'justify' ? styles.active : ""} aria-label="justify" onClick={() => applyAlignment("justify")}>
                <FormatAlignJustifyIcon fontSize="small" />
            </IconButton>
            <span className={styles.chapterTitle}>
                <EditableText textValue={chapter?.title ? chapter.title : "Missing Title"} onTextChange={onChapterTitleEdit} inputTextAlign="right" />
            </span>
            <DocumentExporter />
        </div>
    );
};
