import { createContext } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";
import { Chapter } from "../types/Chapter";
import { SimplifiedAssociation } from "../types/Associations";

type SelectionsContextType = {
  story: Story | undefined;
  setStory: React.Dispatch<React.SetStateAction<Story | undefined>>;
  deselectStory: () => void;

  series: Series | undefined;
  setSeries: React.Dispatch<React.SetStateAction<Series | undefined>>;
  deselectSeries: () => void;

  association: SimplifiedAssociation | undefined;
  setAssociation: React.Dispatch<
    React.SetStateAction<SimplifiedAssociation | undefined>
  >;
  deselectAssociation: () => void;

  chapter: Chapter | undefined;
  setChapter: React.Dispatch<React.SetStateAction<Chapter | undefined>>;
  deselectChapter: () => void;

  deselectAll: () => void;
};

export const SelectionsContext = createContext<
  SelectionsContextType | undefined
>(undefined);
