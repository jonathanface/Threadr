import { useEffect, useMemo, useState } from "react";
import { ThreadWriter } from "../../components/ThreadWriter";
import { useLoader } from "../../hooks/useLoader";
import { useParams, useSearchParams } from 'react-router-dom';
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { Chapter } from "../../types/Chapter";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { AlertState, AlertToastType } from "../../types/AlertToasts";

export const DocumentEditorPage = () => {
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    const { storyID } = useParams<{ storyID: string }>();
    const [searchParams] = useSearchParams();
    const [chapterID, setChapterID] = useState(searchParams.get('chapter'));
    const { story, setStory, setSeries, setChapter } = useSelections();

    const fetchError: AlertState = useMemo(() => ({
        title: "Error retrieving data",
        message:
            "We are experiencing difficulty retrieving some or all of your data",
        severity: AlertToastType.error,
        open: true,
        timeout: 6000,
    }), []);

    // Fetch Story
    useEffect(() => {
        if (!storyID || !storyID.length) return;
        const fetchStory = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/stories/${storyID}`);
                if (!response.ok) throw new Error('Story not found');
                const data = await response.json() as Story;

                console.log("setting story from index")
                setStory(data);
            } catch (err) {
                console.error(err);
                setAlertState(fetchError);
            } finally {
                hideLoader();
            }
        };

        fetchStory();
    }, [storyID, fetchError, hideLoader, showLoader, setStory, setAlertState]);

    // Fetch Series
    useEffect(() => {
        if (!story || !story.series_id) return;

        const fetchSeries = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/series/${story.series_id}`);
                if (!response.ok) throw new Error('Series not found');
                const data = await response.json() as Series;
                setSeries(data);
            } catch (err) {
                console.error(err);
                setAlertState(fetchError);
            } finally {
                hideLoader();
            }
        };

        fetchSeries();
    }, [story, fetchError, setAlertState, setSeries, showLoader, hideLoader]);

    // Fetch Chapter
    useEffect(() => {
        if (!storyID) return;
        const fetchChapter = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/stories/${storyID}/chapters/${chapterID}`);
                if (!response.ok) throw new Error(response.statusText);
                const data = await response.json() as Chapter;
                setChapter(data);
            } catch (err) {
                console.error(err);
                setAlertState(fetchError);
            } finally {
                hideLoader();
            }
        };
        if (chapterID) {
            fetchChapter();
        }
    }, [storyID, chapterID, fetchError, showLoader, setAlertState, setChapter, hideLoader]);

    useEffect(() => {
        if ((!chapterID || !chapterID.length) && story) {
            setChapterID(story.chapters[0].id)
            console.log("defaulting to", story.chapters[0].id);
            const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?chapter=' + story.chapters[0].id;
            window.history.pushState({ path: newurl }, '', newurl);
            return;
        }
        setChapterID(chapterID);
    }, [chapterID, searchParams, story]);
    return (
        <ThreadWriter />
    );
};
