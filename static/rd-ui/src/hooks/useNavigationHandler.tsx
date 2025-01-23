import { useCallback, useEffect, useState } from "react";
import { StoryAction } from "../contexts/selections";
import { useCurrentSelections } from "./useCurrentSelections";
import { Story } from "../types/Story";


export const useHandleNavigationHandler = () => {
  const { setCurrentStory, deselectStory, setCurrentStoryAction, currentStory, setCurrentChapter } =
    useCurrentSelections();
  const [navLoading, setNavLoading] = useState(true);

  const fetchStoryDetails = async (storyID: string) => {
    const url = `/api/stories/${storyID}`;
    try {
      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error(`Error fetching story: ${response.statusText}`);
      return await response.json() as Story;
    } catch (error) {
      console.error("Failed to fetch story details:", error);
      return null;
    }
  }

  const fetchChapterDetails = async (storyID: string, chapterID: string) => {
    try {
      const response = await fetch("/api/stories/" + storyID + "/chapters/" + chapterID, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return await response.json();
    } catch (error: unknown) {
      console.error(`Error retrieving chapters: ${error}`);
      return null;
    }
  };

  const handleNavChange = useCallback(async () => {
    setNavLoading(true);
    const location = window.location.pathname;
    const splitDirectories = location.split("/");

    if (splitDirectories[1] === "story" && splitDirectories[2]?.trim()) {
      const storyID = splitDirectories[2].trim();
      // Avoid fetching if the current story is already loaded
      if (!currentStory || currentStory.story_id !== storyID) {
        const story = await fetchStoryDetails(storyID);
        if (story) {
          setCurrentStory(story);
          setCurrentStoryAction(StoryAction.editing);
          const urlParams = new URLSearchParams(window.location.search);
          const chapterID = urlParams.get("chapter");
          if (chapterID?.length) {
            const chapter = await fetchChapterDetails(storyID, chapterID);
            setCurrentChapter(chapter);
          } else {
            const firstChapterID = story.chapters[0].id;
            const chapter = await fetchChapterDetails(storyID, firstChapterID);
            setCurrentChapter(chapter);
          }
        } else {
          deselectStory();
        }
      }
    } else {
      deselectStory();
    }
    setNavLoading(false);

  }, [currentStory, setCurrentStory, setCurrentStoryAction, setCurrentChapter, deselectStory]);

  useEffect(() => {
    window.addEventListener("popstate", handleNavChange);
    return () => window.removeEventListener("popstate", handleNavChange);
  }, [handleNavChange]);

  return { handleNavChange, navLoading };
};
