import { useContext } from "react";
import { DocumentSettingsContext } from "../contexts/documentSettings";

export const useDocumentSettings = () => {
    const context = useContext(DocumentSettingsContext);
    if (!context) {
        throw new Error("useDocumentSettings must be used within a DocumentSettingsProvider");
    }
    return context;
};