import { useCallback, useContext, useEffect, useState } from "react";
import { ThreadWriter } from "../../components/ThreadWriter"
import { UserContext } from "../../contexts/user";
import { useCurrentStoryContext } from "../../contexts/selections";
import { Chapter } from "../../types/Chapter";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { useLoader } from "../../hooks/useLoader";

export const DocumentEditorPage = () => {
    console.log("loading document editor")
    const { currentStory } = useCurrentStoryContext();
    const userData = useContext(UserContext);
    const { setAlertState } = useToaster();
    const { setIsLoaderVisible } = useLoader();
    const [selectedChapter, setSelectedChapter] = useState<Chapter | undefined>(undefined);

    const urlParams = new URLSearchParams(window.location.search);
    const chapterID = urlParams.get("chapter") || (currentStory?.chapters.length ? currentStory.chapters[0].id : "");

    const getChapterDetails = useCallback(async () => {
        try {
            setIsLoaderVisible(true);
            const response = await fetch("/api/stories/" + currentStory?.story_id + "/chapters/" + chapterID, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            const responseJSON = (await response.json()) as Chapter;
            console.log("resp", responseJSON);
            setSelectedChapter(responseJSON as Chapter);
        } catch (error: unknown) {
            console.error(`Error retrieving chapters: ${error}`);
            setAlertState({
                title: "Error",
                message: "There was an error retrieving your chapter contents. Please report this.",
                severity: AlertToastType.error,
                open: true,
                timeout: 6000,
            });
        } finally {
            setIsLoaderVisible(false);
        }
    }, [chapterID, currentStory?.story_id, setAlertState, setIsLoaderVisible]);

    useEffect(() => {
        if (currentStory) {
            getChapterDetails();
        }
    }, [currentStory?.story_id, chapterID, getChapterDetails]);

    return (userData?.isLoggedIn && currentStory && selectedChapter ? (
        <ThreadWriter storyID={currentStory.story_id} chapter={selectedChapter} />
    ) : (
        <div />
    ));
}