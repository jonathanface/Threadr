import { useCallback, useEffect, useRef, useState } from "react";
import { AssociationsContext } from "../contexts/associations";
import { SimplifiedAssociation } from "../types/Associations";
import { useLoader } from "../hooks/useLoader";

export const AssociationsProvider: React.FC<{ storyID: string; children: React.ReactNode }> = ({ storyID, children }) => {
    const { showLoader, hideLoader } = useLoader();
    const [associations, setAssociations] = useState<SimplifiedAssociation[]>([]);
    const didFetch = useRef(false);

    const fetchAssociations = useCallback(async () => {
        if (!storyID || didFetch.current) return;

        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyID}/associations/thumbs`);
            if (!response.ok) throw response;
            const data = await response.json();
            setAssociations(data.filter((association: SimplifiedAssociation) => association.association_name.trim().length));
        } catch (error: unknown) {
            const apiResponse = error as Response;
            if (apiResponse?.status === 404) {
                setAssociations([]);
            }
            console.error(`Error retrieving associations: ${apiResponse?.statusText || error}`);
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