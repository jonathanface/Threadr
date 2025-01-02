import { createContext } from "react";

export type LoaderContextType = {
  isLoaderVisible: boolean;
  setIsLoaderVisible: (visible: boolean) => void;
};

export const LoaderContext = createContext<LoaderContextType | undefined>(
  undefined
);
