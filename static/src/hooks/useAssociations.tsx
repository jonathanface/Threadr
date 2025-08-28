import { useContext } from "react";
import { AssociationsContext } from "../contexts/associations";

export const useAssociations = () => {
    const context = useContext(AssociationsContext);
    if (!context) {
        throw new Error("useAssociations must be used within an AssociationsProvider");
    }
    return context;
};