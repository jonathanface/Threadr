// src/hooks/useLoader.ts
import { useContext } from "react";
import { LoaderContext, LoaderContextType } from "../contexts/loader";

export const useLoader = (): LoaderContextType => {
  const context = useContext(LoaderContext);
  if (!context) {
    throw new Error('useLoader must be used within a LoaderProvider');
  }
  return context;
};