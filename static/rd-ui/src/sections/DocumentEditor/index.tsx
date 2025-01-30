import { useEffect, useState } from "react";
import { ThreadWriter } from "../../components/ThreadWriter";
import { useLoader } from "../../hooks/useLoader";
import { useParams, useSearchParams } from 'react-router-dom';
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { Chapter } from "../../types/Chapter";
import { useSelections } from "../../hooks/useSelections";

export const DocumentEditorPage = () => {
    const { showLoader, hideLoader } = useLoader();
    const { storyID } = useParams<{ storyID: string }>();
    const [searchParams] = useSearchParams();
    const chapterIDQuery = searchParams.get('chapterID');
    const [chapterID, setChapterID] = useState(chapterIDQuery);
    const [error, setError] = useState<string | null>(null);
    const { story, setStory, setSeries, setChapter } = useSelections();

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
                setError('Failed to load story.');
            } finally {
                hideLoader();
            }
        };

        fetchStory();
    }, [storyID]);

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
                setError('Failed to load series.');
            } finally {
                hideLoader();
            }
        };

        fetchSeries();
    }, [story]);

    // Fetch Chapter
    useEffect(() => {
        if (!storyID) return;
        if ((!chapterID || !chapterID.length) && story) {
            setChapterID(story.chapters[0].id)
        }
        const fetchChapter = async () => {
            try {
                showLoader();
                const response = await fetch(`/api/stories/${storyID}/chapters/${chapterID}`);
                if (!response.ok) throw new Error('Chapter not found');
                const data = await response.json() as Chapter;
                setChapter(data);
            } catch (err) {
                console.error(err);
                setError('Failed to load chapter.');
            } finally {
                hideLoader();
            }
        };
        if (chapterID) {
            fetchChapter();
        }
    }, [storyID, chapterID, story]);

    return (
        <>
            {error && <div className="error">{error}</div>}
            <ThreadWriter />
        </>
    );
};
