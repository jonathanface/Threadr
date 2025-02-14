// hooks/useFetchAssociations.ts
import { useCallback } from 'react';
import { SimplifiedAssociation } from '../types/Associations';
import { useLoader } from './useLoader';

export const useFetchAssociations = (
    storyId: string,
    setAssociations: (assocs: SimplifiedAssociation[]) => void
) => {
    const { showLoader, hideLoader } = useLoader();

    const getAllAssociations = useCallback(async () => {
        if (!storyId) return;
        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyId}/associations/thumbs`);
            if (!response.ok) throw response;
            const associationsData = await response.json();
            setAssociations(
                associationsData.filter((association: SimplifiedAssociation) => association.association_name.trim().length)
            );
        } catch (error: unknown) {
            console.error(`Error retrieving associations: ${(error as Response).statusText}`);
        } finally {
            hideLoader();
        }
    }, [hideLoader, showLoader, setAssociations, storyId]);

    return { getAllAssociations };
};
