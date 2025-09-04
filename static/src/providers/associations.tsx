import { useCallback, useEffect, useRef, useState } from "react";
import { AssociationsContext } from "../contexts/associations";
import { SimplifiedAssociation } from "../types/Associations";
import { useLoader } from "../hooks/useLoader";
import axios from "axios";
import { api } from "../api";

export const AssociationsProvider: React.FC<{
  storyID: string;
  children: React.ReactNode;
}> = ({ storyID, children }) => {
  const { showLoader, hideLoader } = useLoader();
  const [associations, setAssociations] = useState<SimplifiedAssociation[]>([]);
  const didFetch = useRef(false);

  const fetchAssociations = useCallback(async () => {
    if (!storyID || didFetch.current) return;

    try {
      showLoader();

      const { data } = await api.get<SimplifiedAssociation[]>(
        `/stories/${storyID}/associations/thumbs`,
        {
          validateStatus: (status) => {
            // let 2xx and 404 resolve
            return (status >= 200 && status < 300) || status === 404;
          },
        },
      );

      if (Array.isArray(data)) {
        setAssociations(
          data.filter(
            (association) => association.association_name.trim().length > 0,
          ),
        );
      } else {
        setAssociations([]);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Error retrieving associations: ${error.response?.statusText || error.message}`,
        );
      } else {
        console.error("Unexpected error retrieving associations:", error);
      }
    } finally {
      didFetch.current = true;
      hideLoader();
    }
  }, [storyID, showLoader, hideLoader]);

  useEffect(() => {
    didFetch.current = false;
    fetchAssociations();
  }, [fetchAssociations, storyID]);

  return (
    <AssociationsContext.Provider value={{ associations, setAssociations }}>
      {children}
    </AssociationsContext.Provider>
  );
};
