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
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    setIsConfigPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
  } = appNavigationContext;
  return {
    isCreatingSeries,
    isCreatingStory,
    isConfigPanelOpen,
    isSubscriptionFormOpen,
    isLoginPanelOpen,
    setIsCreatingSeries,
    setIsCreatingStory,
    setIsConfigPanelOpen,
    setIsSubscriptionFormOpen,
    setIsLoginPanelOpen,
  };
};
