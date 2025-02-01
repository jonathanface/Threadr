import { useContext } from "react";
import { WorksListContext } from "../contexts/worksList";

export const useWorksList = () => {
    const context = useContext(WorksListContext);
    if (!context) {
        throw new Error("WorksListContext must be used within a WorksListProvider");
    }
    return context;
};
