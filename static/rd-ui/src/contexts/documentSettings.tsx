import { createContext } from "react";
import { DocumentSettings } from "../types/Document";


type DocumentSettingsContextType = {
    documentSettings: DocumentSettings | null;
    setDocumentSettings: React.Dispatch<React.SetStateAction<DocumentSettings | null>>;
    saveDocumentSettings: (settings: DocumentSettings) => Promise<void>
}

export const DocumentSettingsContext = createContext<DocumentSettingsContextType | undefined>(
    undefined
);
