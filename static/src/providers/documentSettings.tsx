import { useCallback, useEffect, useState } from "react";
import { useLoader } from "../hooks/useLoader";
import { DocumentSettings } from "../types/Document";
import { DocumentSettingsContext } from "../contexts/documentSettings";
import axios from "axios";
import { api } from "../api";

const defaultSettings: DocumentSettings = {
  spellcheck: true,
  autotab: true,
  font_family: "Arial",
  font_size: 16,
  line_spacing: 2.0,
};

// Stories saved before typography fields existed will come back with empty/zero
// values; merge them onto defaults so the editor still renders correctly.
const withDefaults = (s: DocumentSettings): DocumentSettings => ({
  ...s,
  font_family: s.font_family || defaultSettings.font_family,
  font_size: s.font_size || defaultSettings.font_size,
  line_spacing: s.line_spacing || defaultSettings.line_spacing,
});

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

      const response = await api.get<DocumentSettings>(
        `/stories/${storyID}/settings`,
        {
          validateStatus: (status) => {
            // ✅ let 2xx and 404 resolve
            return (status >= 200 && status < 300) || status === 404;
          },
        },
      );

      if (response.status === 200 && response.data) {
        setDocumentSettings(withDefaults(response.data));
      } else {
        // 404 or empty -> no settings, use defaults
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
    // Apply optimistically so controlled inputs (Selects, checkboxes) and the
    // editor's inline style reflect the user's choice immediately, instead of
    // visually reverting while the PUT is in flight.
    setDocumentSettings(withDefaults(settings));
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

      // Merge the response on top of what we sent. If the server omits any
      // typography fields (e.g. running a stale binary), the user's chosen
      // values still stick instead of reverting to defaults.
      setDocumentSettings(withDefaults({ ...settings, ...data }));
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
