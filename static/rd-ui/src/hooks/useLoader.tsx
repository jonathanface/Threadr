import { useContext } from "react";
import { LoaderContext } from "../contexts/loader";

export const useLoader = () => {
  const loaderContext = useContext(LoaderContext);
  if (!loaderContext) {
    throw new Error(
      "LoaderContext must be used within a LoaderContext.Provider"
    );
  }
  const { isLoaderVisible, setIsLoaderVisible } = loaderContext;

  return { isLoaderVisible, setIsLoaderVisible };
};
