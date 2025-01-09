import React, { createContext, useContext, useState } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";

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
type CurrentStoryContextType = {
  currentStory: Story | undefined;
  currentStoryAction: StoryAction;
  setCurrentStory: (story: Story | undefined) => void;
  setCurrentStoryAction: (action: StoryAction) => void;
  deselectStory: () => void;
};

type CurrentSeriesContextType = {
  currentSeries: Series | undefined;
  currentSeriesAction: SeriesAction;
  setCurrentSeries: (series: Series | undefined) => void;
  setCurrentSeriesAction: (action: SeriesAction) => void;
  deselectSeries: () => void;
};

const CurrentStoryContext = createContext<CurrentStoryContextType | undefined>(
  undefined
);

const CurrentSeriesContext = createContext<
  CurrentSeriesContextType | undefined
>(undefined);

export const StorySelectionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [currentStory, setCurrentStory] = useState<Story | undefined>(
    undefined
  );
  console.log("StorySelectionProvider mounted");
  const [currentStoryAction, setCurrentStoryAction] = useState<StoryAction>(
    StoryAction.none
  );

  const deselectStory = () => {
    setCurrentStory(undefined);
    setCurrentStoryAction(StoryAction.none);
  };

  return (
    <CurrentStoryContext.Provider
      value={{
        currentStoryAction,
        currentStory,
        deselectStory,
        setCurrentStoryAction,
        setCurrentStory,
      }}
    >
      {children}
    </CurrentStoryContext.Provider>
  );
};

export const SeriesSelectionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [currentSeries, setCurrentSeries] = useState<Series | undefined>(
    undefined
  );
  console.log("SeriesSelectionProvider mounted");
  const [currentSeriesAction, setCurrentSeriesAction] = useState<SeriesAction>(
    SeriesAction.none
  );

  const deselectSeries = () => {
    setCurrentSeries(undefined);
    setCurrentSeriesAction(SeriesAction.none);
  };

  return (
    <CurrentSeriesContext.Provider
      value={{
        currentSeriesAction,
        currentSeries,
        deselectSeries,
        setCurrentSeries,
        setCurrentSeriesAction,
      }}
    >
      {children}
    </CurrentSeriesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrentStoryContext = () => {
  const context = useContext(CurrentStoryContext);
  if (!context) {
    throw new Error(
      "useCurrentStoryContext must be used within a StoryProvider"
    );
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrentSeriesContext = () => {
  const context = useContext(CurrentSeriesContext);
  if (!context) {
    throw new Error(
      "CurrentSeriesContext must be used within a SeriesProvider"
    );
  }
  return context;
};
