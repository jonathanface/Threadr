// src/contexts/loader.tsx
import React, { createContext, useMemo, useState, ReactNode, useEffect } from "react";

export interface LoaderContextType {
  hideLoader: () => void;
  showLoader: () => void;
  loadingCount: number;
}

export const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

export const LoaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [loadingCount, setLoadingCount] = useState(0);

  const showLoader = () => {
    setLoadingCount((prevCount) => prevCount + 1);
  }

  const hideLoader = () => {
    setLoadingCount((prevCount) => Math.max(prevCount - 1, 0));
  };

  const loaderValue = useMemo(
    () => ({
      showLoader,
      hideLoader,
      loadingCount
    }),
    [loadingCount]
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
