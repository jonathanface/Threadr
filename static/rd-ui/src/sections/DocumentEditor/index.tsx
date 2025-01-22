import { useContext } from "react";
import { ThreadWriter } from "../../components/ThreadWriter"
import { UserContext } from "../../contexts/user";
import { useCurrentSelections } from "../../hooks/useCurrentSelections";

export const DocumentEditorPage = () => {
    console.log("loading document editor")
    const userData = useContext(UserContext);
    const { currentStory, currentChapter } = useCurrentSelections();



    return (userData?.isLoggedIn && currentStory && currentChapter ? (
        <ThreadWriter />
    ) : (
        <div />
    ));
}