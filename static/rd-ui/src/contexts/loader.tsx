// src/contexts/loader.tsx
import { createContext } from "react";

export interface LoaderContextType {
  hideLoader: () => void;
  showLoader: () => void;
  loadingCount: number;
}

export const LoaderContext = createContext<LoaderContextType | undefined>(undefined);
