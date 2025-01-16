import { createContext, useMemo, useState } from "react";

export type LoaderContextType = {
  isLoaderVisible: boolean;
  setIsLoaderVisible: (visible: boolean) => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const LoaderContext = createContext<LoaderContextType | undefined>(
  undefined
);

export const LoaderProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  console.log("LoaderProvider mounted");
  const [isLoaderVisible, setIsLoaderVisible] = useState(false);

  const loaderValue = useMemo(
    () => ({
      isLoaderVisible,
      setIsLoaderVisible,
    }),
    [isLoaderVisible]
  );

  return (
    <LoaderContext.Provider value={loaderValue}>
      {children}
    </LoaderContext.Provider>
  );
};
