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
    isEditingSeries,
    isEditingStory,
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    setIsConfigPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setIsEditingSeries,
    setIsEditingStory,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
  } = appNavigationContext;
  return {
    isCreatingSeries,
    isCreatingStory,
    isEditingSeries,
    isEditingStory,
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setIsEditingSeries,
    setIsEditingStory,
    setIsConfigPanelOpen,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
  };
};
