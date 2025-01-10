import { useCallback, useContext, useEffect, useState } from "react";
import { ThreadWriter } from "../../components/ThreadWriter"
import { UserContext } from "../../contexts/user";
import { useCurrentStoryContext } from "../../contexts/selections";
import { Chapter } from "../../types/Chapter";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import { useLoader } from "../../hooks/useLoader";

export const DocumentEditorPage = () => {
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
                console.error(response.body);
                throw new Error("Error retrieving your chapter");
            } else {
                const responseJSON = (await response.json()) as Chapter;
                console.log("resp", responseJSON);
                setSelectedChapter(responseJSON as Chapter);
            }
        } catch (error: unknown) {
            console.error(error);
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

    const getBatchedStoryBlocks = useCallback(async (startKey: string) => {
        try {
            setIsLoaderVisible(true);
            const response = await fetch("/api/stories/" + currentStory?.story_id + "/content?key=" + startKey + "&chapter=" + selectedChapter?.id, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                console.error(response.body);
                throw new Error("Error retrieving your chapter contents");
            }
            const data = response.json();
            console.log("data", data);
            //     data.last_evaluated_key && data.last_evaluated_key.key_id.Value
            //     ? (lastRetrievedBlockKey = data.last_evaluated_key.key_id.Value)
            //     : (lastRetrievedBlockKey = null);
            // const newBlocks: ContentBlock[] = [];
            // if (data.items) {
            //     data.items.forEach((piece: any) => {
            //         if (piece.chunk && piece.chunk.Value) {
            //             const jsonBlock = JSON.parse(piece.chunk.Value);
            //             const characterListImmutable = Immutable.List(
            //                 jsonBlock.characterList.map((char: CharMetadata) => {
            //                     // Convert each character metadata object to a DraftJS CharacterMetadata
            //                     return CharacterMetadata.create({
            //                         style: Immutable.OrderedSet(char.style),
            //                         entity: char.entity,
            //                     });
            //                 })
            //             );
            //             const block = new ContentBlock({
            //                 characterList: characterListImmutable,
            //                 depth: jsonBlock.depth,
            //                 key: piece.key_id.Value,
            //                 text: jsonBlock.text ? jsonBlock.text : "",
            //                 type: jsonBlock.type,
            //                 data: jsonBlock.data ? Immutable.Map(jsonBlock.data) : Immutable.Map(),
            //             });
            //             newBlocks.push(block);
            //         }
            //     });
            //     if (newBlocks.length === 1 && !newBlocks[0].getText().length) {
            //         showGreeting();
            //     }
            // }
        } catch (error: unknown) {
            console.error(error);
        } finally {
            setIsLoaderVisible(false);
        }
    }, [currentStory?.story_id, selectedChapter?.id, setIsLoaderVisible]);


    useEffect(() => {
        if (currentStory) {
            getChapterDetails();
        }
    }, [currentStory?.story_id, chapterID, getChapterDetails, currentStory]);

    useEffect(() => {
        if (selectedChapter) {
            getBatchedStoryBlocks("");
        }
    }, [selectedChapter, getBatchedStoryBlocks]);

    return (userData?.isLoggedIn ? (
        <ThreadWriter chapter={selectedChapter} />
    ) : (
        <div />
    ));
}