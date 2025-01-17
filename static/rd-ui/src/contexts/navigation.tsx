import { createContext, useState } from "react";
import { Story } from "../types/Story";
import { Series } from "../types/Series";

type AppNavigation = {
  isCreatingSeries: boolean;
  isCreatingStory: boolean;
  storyPreassignSeriesID?: string;
  isEditingStory: Story | null;
  isEditingSeries: Series | null;
  isConfigPanelOpen: boolean;
  isSubscriptionFormOpen: boolean;
  isLoginPanelOpen: boolean;
  isAssociationPanelOpen: boolean;
  setIsCreatingSeries: (creatingSeries: boolean) => void;
  setIsCreatingStory: (creatingStory: boolean) => void;
  setStoryPreassignSeriesID: (seriesID: string) => void;
  setIsEditingStory: (editingStory: Story | null) => void;
  setIsEditingSeries: (editingSeries: Series | null) => void;
  setIsConfigPanelOpen: (configPanelOpen: boolean) => void;
  setIsSubscriptionFormOpen: (subscriptionFormOpen: boolean) => void;
  setIsLoginPanelOpen: (loginPanelOpen: boolean) => void;
  setIsAssociationPanelOpen: (associationPanelOpen: boolean) => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const AppNavigationContext = createContext<AppNavigation | undefined>(
  undefined
);

export const AppNavigationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  console.log("AppNavigationProvider mounted");
  const [isCreatingSeries, setIsCreatingSeries] = useState(false);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [storyPreassignSeriesID, setStoryPreassignSeriesID] = useState("");
  const [isEditingStory, setIsEditingStory] = useState<Story | null>(null);
  const [isEditingSeries, setIsEditingSeries] = useState<Series | null>(null);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [isSubscriptionFormOpen, setIsSubscriptionFormOpen] = useState(false);
  const [isLoginPanelOpen, setIsLoginPanelOpen] = useState(false);
  const [isAssociationPanelOpen, setIsAssociationPanelOpen] = useState(false);
  return (
    <AppNavigationContext.Provider
      value={{
        isCreatingSeries,
        isCreatingStory,
        storyPreassignSeriesID,
        isEditingStory,
        isEditingSeries,
        isConfigPanelOpen,
        isSubscriptionFormOpen,
        isLoginPanelOpen,
        isAssociationPanelOpen,
        setIsCreatingSeries,
        setIsCreatingStory,
        setStoryPreassignSeriesID,
        setIsEditingStory,
        setIsEditingSeries,
        setIsConfigPanelOpen,
        setIsSubscriptionFormOpen,
        setIsLoginPanelOpen,
        setIsAssociationPanelOpen
      }}
    >
      {children}
    </AppNavigationContext.Provider>
  );
};