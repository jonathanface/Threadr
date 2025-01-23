import React, { createContext, useState } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";
import { Chapter } from "../types/Chapter";

// eslint-disable-next-line react-refresh/only-export-components
export enum StoryAction {
  editing = "editing",
  viewing = "viewing",
  none = "none",
}
// eslint-disable-next-line react-refresh/only-export-components
export enum SeriesAction {
  editing = "editing",
  viewing = "viewing",
  none = "none",
}

type CurrentSelectionsContextType = {
  currentStory: Story | undefined;
  currentStoryAction: StoryAction;
  setCurrentStory: (story: Story | undefined) => void;
  setCurrentStoryAction: (action: StoryAction) => void;
  deselectStory: () => void;

  currentSeries: Series | undefined;
  currentSeriesAction: SeriesAction;
  setCurrentSeries: (series: Series | undefined) => void;
  setCurrentSeriesAction: (action: SeriesAction) => void;
  deselectSeries: () => void;

  currentAssociationID: string | undefined;
  setCurrentAssociationID: (id: string) => void;
  deselectAssociation: () => void;

  currentChapter: Chapter | undefined;
  setCurrentChapter: (chapter: Chapter) => void;
  deselectChapter: () => void;
};

export const CurrentSelectionsContext = createContext<CurrentSelectionsContextType | undefined>(
  undefined
);


export const CurrentSelectionsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {

  const [currentStory, setCurrentStory] = useState<Story | undefined>(
    undefined
  );
  console.log("CurrentSelectionProvider mounted");
  const [currentStoryAction, setCurrentStoryAction] = useState<StoryAction>(
    StoryAction.none
  );
  const deselectStory = () => {
    setCurrentStory(undefined);
    setCurrentStoryAction(StoryAction.none);
  };

  const [currentSeries, setCurrentSeries] = useState<Series | undefined>(
    undefined
  );
  const [currentSeriesAction, setCurrentSeriesAction] = useState<SeriesAction>(
    SeriesAction.none
  );
  const deselectSeries = () => {
    setCurrentSeries(undefined);
    setCurrentSeriesAction(SeriesAction.none);
  };

  const [currentChapter, setCurrentChapter] = useState<Chapter | undefined>(
    undefined
  );
  const deselectChapter = () => {
    setCurrentChapter(undefined);
  };

  const [currentAssociationID, setCurrentAssociationID] = useState<string | undefined>(
    undefined
  );

  const deselectAssociation = () => {
    setCurrentAssociationID(undefined);
  }

  return (
    <CurrentSelectionsContext.Provider
      value={{
        currentStoryAction,
        currentStory,
        deselectStory,
        setCurrentStoryAction,
        setCurrentStory,

        currentSeriesAction,
        currentSeries,
        deselectSeries,
        setCurrentSeries,
        setCurrentSeriesAction,

        currentChapter,
        setCurrentChapter,
        deselectChapter,

        currentAssociationID,
        setCurrentAssociationID,
        deselectAssociation
      }}
    >
      {children}
    </CurrentSelectionsContext.Provider>
  );
};
