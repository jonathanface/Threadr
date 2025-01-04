import { createContext, useState } from "react";

type AppNavigation = {
  isCreatingSeries: boolean;
  isCreatingStory: boolean;
  isConfigPanelOpen: boolean;
  isSubscriptionFormOpen: boolean;
  isLoginPanelOpen: boolean;
  setIsCreatingSeries: (creatingSeries: boolean) => void;
  setIsCreatingStory: (creatingStory: boolean) => void;
  setIsConfigPanelOpen: (configPanelOpen: boolean) => void;
  setIsSubscriptionFormOpen: (subscriptionFormOpen: boolean) => void;
  setIsLoginPanelOpen: (loginPanelOpen: boolean) => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const AppNavigationContext = createContext<AppNavigation | undefined>(
  undefined
);

export const AppNavigationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [isCreatingSeries, setIsCreatingSeries] = useState(false);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isSubscriptionFormOpen, setIsSubscriptionFormOpen] = useState(false);
  const [isLoginPanelOpen, setIsLoginPanelOpen] = useState(false);
  return (
    <AppNavigationContext.Provider
      value={{
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
      }}
    >
      {children}
    </AppNavigationContext.Provider>
  );
};
