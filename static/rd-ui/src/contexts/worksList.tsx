import { createContext, useState } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";

type WorksContextType = {
    storiesList: Story[] | undefined;
    seriesList: Series[] | undefined;
    setStoriesList: (list: Story[] | undefined) => void;
    setSeriesList: (list: Series[] | undefined) => void;
}

export const WorksListContext = createContext<WorksContextType | undefined>(
    undefined
);

export const WorksListContextProvider: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    console.log("WorksListContextProvider mounted")
    const [storiesList, setStoriesList] = useState<undefined | Story[]>(undefined);
    const [seriesList, setSeriesList] = useState<undefined | Series[]>(undefined);
    return (
        <WorksListContext.Provider
            value={{
                storiesList,
                seriesList,
                setStoriesList,
                setSeriesList
            }}
        >
            {children}
        </WorksListContext.Provider>
    );
};
