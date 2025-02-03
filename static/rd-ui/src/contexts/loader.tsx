// src/contexts/loader.tsx
import React, { createContext, useMemo, useState, ReactNode, useEffect, useCallback } from "react";

export interface LoaderContextType {
  hideLoader: () => void;
  showLoader: () => void;
  loadingCount: number;
}

export const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export const LoaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [loadingCount, setLoadingCount] = useState(0);

  const showLoader = useCallback(() => {
    setLoadingCount((prevCount) => prevCount + 1);
  }, []);

  const hideLoader = useCallback(() => {
    setLoadingCount((prevCount) => Math.max(prevCount - 1, 0));
  }, []);

  const loaderValue = useMemo(
    () => ({
      showLoader,
      hideLoader,
      loadingCount
    }),
    [showLoader, hideLoader, loadingCount]
  );

  useEffect(() => {
    console.log("LoaderProvider mounted");
    return () => {
      console.log("LoaderProvider unmounted");
    };
  }, []);

  return (
    <LoaderContext.Provider value={loaderValue}>
      {children}
    </LoaderContext.Provider>
  );
};
