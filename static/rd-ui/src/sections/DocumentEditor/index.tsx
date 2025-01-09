import { useContext } from "react";
import { ThreadWriter } from "../../components/ThreadWriter"
import { UserContext } from "../../contexts/user";
import { useCurrentStoryContext } from "../../contexts/selections";

export const DocumentEditorPage = () => {
    const userData = useContext(UserContext);
    if (!userData) {
        return <div />
    }
    const { isLoggedIn } = userData;
    const { currentStory } = useCurrentStoryContext();

    if (!currentStory || !isLoggedIn) {
        return;
    }

    return (
        <ThreadWriter />
    )
}