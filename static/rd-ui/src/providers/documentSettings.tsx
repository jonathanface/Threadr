import { useCallback, useEffect, useState } from "react";
import { useLoader } from "../hooks/useLoader";
import { DocumentSettings } from "../types/Document";
import { DocumentSettingsContext } from "../contexts/documentSettings";

const defaultSettings: DocumentSettings = {
    spellcheck: true
}

export const DocumentSettingsProvider: React.FC<{ storyID: string; children: React.ReactNode }> = ({ storyID, children }) => {
    const { showLoader, hideLoader } = useLoader();
    const [documentSettings, setDocumentSettings] = useState<DocumentSettings | null>(null);

    const fetchDocumentSettings = useCallback(async () => {
        if (!storyID) return;
        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyID}/settings`);
            if (!response.ok) throw response;
            const data = await response.json();
            setDocumentSettings(data);
        } catch (error: unknown) {
            const apiResponse = error as Response;
            if (apiResponse.status === 404) {
                console.warn("no settings in db, using default values");
                setDocumentSettings(defaultSettings);
            }
            console.error(`Error retrieving settings: ${apiResponse?.statusText || error}`);
        } finally {
            hideLoader();
        }
    }, [storyID, showLoader, hideLoader]);

    const saveDocumentSettings = async (settings: DocumentSettings) => {
        if (!storyID) return;
        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyID}/settings`, {
                credentials: "include",
                method: "PUT",
                body: JSON.stringify(settings),
            });
            if (!response.ok) throw response;
            const data = await response.json();
            setDocumentSettings(data);
        } catch (error: unknown) {
            const apiResponse = error as Response;
            console.error(`Error saving settings: ${apiResponse?.statusText || error}`);
        } finally {
            hideLoader();
        }
    }

    useEffect(() => {
        fetchDocumentSettings();
    }, [fetchDocumentSettings, storyID]);

    return (
        <DocumentSettingsContext.Provider value={{ documentSettings, setDocumentSettings, saveDocumentSettings }}>
            {children}
        </DocumentSettingsContext.Provider>
    );
};