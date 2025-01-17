import { useContext } from "react";
import { AppNavigationContext } from "../contexts/navigation";

export const useAppNavigation = () => {
  const appNavigationContext = useContext(AppNavigationContext);
  if (!appNavigationContext) {
    throw new Error(
      "AppNavigationContext must be used within a AppNavigationContext.Provider"
    );
  }
  const {
    isCreatingSeries,
    isCreatingStory,
    storyPreassignSeriesID,
    isEditingSeries,
    isEditingStory,
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    isAssociationPanelOpen,
    setIsConfigPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setStoryPreassignSeriesID,
    setIsEditingSeries,
    setIsEditingStory,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
    setIsAssociationPanelOpen
  } = appNavigationContext;
  return {
    isCreatingSeries,
    isCreatingStory,
    storyPreassignSeriesID,
    isEditingSeries,
    isEditingStory,
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    isAssociationPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setStoryPreassignSeriesID,
    setIsEditingSeries,
    setIsEditingStory,
    setIsConfigPanelOpen,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
    setIsAssociationPanelOpen
  };
};
