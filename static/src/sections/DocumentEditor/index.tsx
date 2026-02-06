import { useEffect, useMemo } from "react";
import { ThreadWriter } from "../../components/ThreadWriter";
import { useLoader } from "../../hooks/useLoader";
import { useParams, useSearchParams } from "react-router-dom";
import { Story } from "../../types/Story";
import { Series } from "../../types/Series";
import { Chapter } from "../../types/Chapter";
import { useSelections } from "../../hooks/useSelections";
import { useToaster } from "../../hooks/useToaster";
import { AlertState, AlertToastType } from "../../types/AlertToasts";
import { AssociationsProvider } from "../../providers/associations";
import { DocumentSettingsProvider } from "../../providers/documentSettings";
import axios from "axios";
import { api } from "../../api";
import { getLastChapter, saveLastChapter } from "../../utils/chapterMemory";

export const DocumentEditorPage = () => {
  const { storyID } = useParams<{ storyID: string }>();

  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [searchParams, setSearchParams] = useSearchParams();
  const { story, chapter, setStory, setSeries, setChapter } = useSelections();

  const fetchError: AlertState = useMemo(
    () => ({
      title: "Error retrieving data",
      message:
        "We are experiencing difficulty retrieving some or all of your data",
      severity: AlertToastType.error,
      open: true,
    }),
    [],
  );

  // Fetch Story
  useEffect(() => {
    const ac = new AbortController();
    if (!storyID || !storyID.length) return;
    const run = async () => {
      try {
        showLoader();

        const res = await api.get<Story>(`/stories/${storyID}`, {
          signal: ac.signal,
        });
        setStory(res.data);
      } catch (err) {
        if (axios.isCancel(err)) {
          // request was aborted, ignore
        } else if (axios.isAxiosError(err)) {
          console.error(
            `Error fetching story: ${err.response?.status} ${err.response?.statusText || err.message}`,
          );
          setAlertState(fetchError);
        } else {
          console.error(err);
          setAlertState(fetchError);
        }
      } finally {
        hideLoader();
      }
    };
    run();
    return () => ac.abort();
  }, [storyID, fetchError, hideLoader, showLoader, setStory, setAlertState]);

  // Fetch Series
  useEffect(() => {
    if (!story?.series_id) return;
    const ac = new AbortController();
    const run = async () => {
      try {
        showLoader();

        const { data } = await api.get<Series>(`/series/${story.series_id}`, {
          signal: ac.signal,
        });

        setSeries(data);
      } catch (err) {
        if (axios.isCancel(err)) {
          // Request was aborted — safe to ignore
        } else if (axios.isAxiosError(err)) {
          console.error(
            `Error fetching series: ${err.response?.status} ${err.response?.statusText || err.message}`,
          );
          setAlertState(fetchError);
        } else {
          console.error(err);
          setAlertState(fetchError);
        }
      } finally {
        hideLoader();
      }
    };

    run();
    return () => ac.abort();
  }, [story, fetchError, setAlertState, setSeries, showLoader, hideLoader]);

  // Ensure a chapter param exists once story is known
  // Try to use last viewed chapter, otherwise default to first chapter
  useEffect(() => {
    if (!story || !storyID) return;

    const currentChapterParam = searchParams.get("chapter");
 
    if (!currentChapterParam) {
      // No chapter in URL - try to get last viewed chapter from localStorage
      const lastChapterId = getLastChapter(storyID);
      // Verify the last chapter still exists in this story
      const chapterToLoad =
        lastChapterId && story.chapters?.some((ch) => ch.id === lastChapterId)
          ? lastChapterId
          : story.chapters?.[0]?.id;

      if (chapterToLoad) {
        const next = new URLSearchParams(searchParams);
        next.set("chapter", String(chapterToLoad));
        setSearchParams(next, { replace: true });
      }
    }
  }, [story, storyID, searchParams, setSearchParams]);

  // Save chapter to localStorage whenever it changes
  useEffect(() => {
    if (storyID && chapter?.id) {
      saveLastChapter(storyID, chapter.id);
    }
  }, [storyID, chapter?.id]);

  // Fetch Chapter whenever URL param changes
  useEffect(() => {
    const chapterID = searchParams.get("chapter");
    if (!chapterID || !storyID) return;

    const ac = new AbortController();
    const run = async () => {
      try {
        const { data } = await api.get<Chapter>(
          `/stories/${storyID}/chapters/${chapterID}`,
          {
            signal: ac.signal,
          },
        );

        setChapter(data);

        // Save this as the last viewed chapter for this story
        saveLastChapter(storyID, chapterID);
      } catch (e) {
        if (axios.isCancel(e)) {
          // Request was aborted — ignore
        } else if (axios.isAxiosError(e)) {
          console.error(
            `Error fetching chapter: ${e.response?.status} ${e.response?.statusText || e.message}`,
          );
          setAlertState(fetchError);
        } else {
          console.error(e);
          setAlertState(fetchError);
        }
      }
    };
    run();
    return () => ac.abort();
  }, [storyID, searchParams, setChapter, setAlertState, fetchError]);

  if (!storyID) return;

  return (
    <AssociationsProvider storyID={storyID}>
      <DocumentSettingsProvider storyID={storyID}>
        <ThreadWriter />
      </DocumentSettingsProvider>
    </AssociationsProvider>
  );
};
