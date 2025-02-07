import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { LoaderContext } from "../contexts/loader";

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
