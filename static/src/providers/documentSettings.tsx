import { useCallback, useEffect, useState } from "react";
import { useLoader } from "../hooks/useLoader";
import { DocumentSettings } from "../types/Document";
import { DocumentSettingsContext } from "../contexts/documentSettings";
import axios from "axios";
import { api } from "../api";

const defaultSettings: DocumentSettings = {
  spellcheck: true,
  autotab: true,
};

export const DocumentSettingsProvider: React.FC<{
  storyID: string;
  children: React.ReactNode;
}> = ({ storyID, children }) => {
  const { showLoader, hideLoader } = useLoader();
  const [documentSettings, setDocumentSettings] =
    useState<DocumentSettings | null>(null);

  const fetchDocumentSettings = useCallback(async () => {
    if (!storyID) return;
    try {
      showLoader();

      const { data } = await api.get<DocumentSettings>(
        `/stories/${storyID}/settings`,
        {
          validateStatus: (status) => {
            // ✅ let 2xx and 404 resolve
            return (status >= 200 && status < 300) || status === 404;
          },
        },
      );

      if (data) {
        setDocumentSettings(data);
      } else {
        // 404 -> no settings, use defaults
        console.warn("no settings in db, using default values");
        setDocumentSettings(defaultSettings);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error retrieving settings: ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error("Unexpected error retrieving settings:", error);
      }
    } finally {
      hideLoader();
    }
  }, [storyID, showLoader, hideLoader]);

  const saveDocumentSettings = async (settings: DocumentSettings) => {
    if (!storyID) return;
    try {
      showLoader();

      const { data } = await api.put<DocumentSettings>(
        `/stories/${storyID}/settings`,
        settings,
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" },
        },
      );

      setDocumentSettings(data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error saving settings: ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error("Unexpected error saving settings:", error);
      }
    } finally {
      hideLoader();
    }
  };

  useEffect(() => {
    fetchDocumentSettings();
  }, [fetchDocumentSettings, storyID]);

  return (
    <DocumentSettingsContext.Provider
      value={{ documentSettings, setDocumentSettings, saveDocumentSettings }}
    >
      {children}
    </DocumentSettingsContext.Provider>
  );
};
