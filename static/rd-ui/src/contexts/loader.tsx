import { createContext, useState } from "react";

export type LoaderContextType = {
  isLoaderVisible: boolean;
  setIsLoaderVisible: (visible: boolean) => void;
};

export const LoaderContext = createContext<LoaderContextType | undefined>(
  undefined
);

export const LoaderProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoaderVisible, setIsLoaderVisible] = useState(false);

  const loaderValue: LoaderContextType = {
    isLoaderVisible,
    setIsLoaderVisible,
  };

  return (
    <LoaderContext.Provider value={loaderValue}>
      {children}
    </LoaderContext.Provider>
  );
};
