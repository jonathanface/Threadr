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

export const DocumentEditorPage = () => {
  const { storyID } = useParams<{ storyID: string }>();

  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [searchParams, setSearchParams] = useSearchParams();
  const { story, setStory, setSeries, setChapter } = useSelections();

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
        const response = await fetch(`/api/stories/${storyID}`, {
          signal: ac.signal,
        });
        if (!response.ok) throw new Error("Story not found");
        const data = (await response.json()) as Story;

        console.log("setting story from index");
        setStory(data);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setAlertState(fetchError);
        }
        console.error(err);
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
        const response = await fetch(`/api/series/${story.series_id}`, {
          signal: ac.signal,
        });
        if (!response.ok) throw new Error("Series not found");
        const data = (await response.json()) as Series;
        setSeries(data);
      } catch (err) {
        console.error(err);
        setAlertState(fetchError);
      } finally {
        hideLoader();
      }
    };

    run();
    return () => ac.abort();
  }, [story, fetchError, setAlertState, setSeries, showLoader, hideLoader]);

  // Ensure a chapter param exists once story is known
  useEffect(() => {
    if (!story) return;
    const current = searchParams.get("chapter");
    if (!current) {
      const firstId = story.chapters?.[0]?.id;
      if (firstId) {
        const next = new URLSearchParams(searchParams);
        next.set("chapter", String(firstId));
        setSearchParams(next, { replace: true });
      }
    }
  }, [story, searchParams, setSearchParams]);

  // Fetch Chapter whenever URL param changes
  useEffect(() => {
    const chapterID = searchParams.get("chapter");
    if (!chapterID) return;

    const ac = new AbortController();
    const run = async () => {
      try {
        const res = await fetch(
          `/api/stories/${storyID}/chapters/${chapterID}`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error(res.statusText);
        const data = (await res.json()) as Chapter;
        setChapter(data);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
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
