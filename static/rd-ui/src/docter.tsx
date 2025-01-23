import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

import { memo, useEffect } from "react";
import "./css/main.css";
import { ConfigPanelModal } from "./sections/UserConfigPanel";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { LoginPanelModal } from "./sections/LoginPanel";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { SubscribePanel } from "./sections/SubscribePanel";
import { UserMenu } from "./sections/UserMenu";

import { useHandleNavigationHandler } from "./hooks/useNavigationHandler";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { CreatEditStoryPanel } from "./sections/CreateEditStoryPanel";
import { StoryAction } from "./contexts/selections";
import { useCurrentSelections } from "./hooks/useCurrentSelections";
import { useWorksList } from "./hooks/useWorksList";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY ?? "");

export const Docter = memo(() => {
  console.log("Docter mounted");
  useEffect(() => {
    return () => console.log("Docter unmounted");
  }, []);

  const { isLoggedIn, userLoading } = useFetchUserData();
  const { handleNavChange, navLoading } = useHandleNavigationHandler();
  const { currentStory, currentStoryAction } = useCurrentSelections();
  const { seriesList, setSeriesList, storiesList, setStoriesList } = useWorksList();

  useEffect(() => {
    handleNavChange();
  }, [handleNavChange]);

  const renderContent = () => {
    if (
      isLoggedIn &&
      currentStory &&
      currentStoryAction === StoryAction.editing
    ) {
      return <DocumentEditorPage />;
    }
    if (
      (isLoggedIn && !currentStory) ||
      (isLoggedIn && currentStory && currentStoryAction === StoryAction.none)
    ) {
      return <StoryAndSeriesListing seriesList={seriesList} setSeriesList={setSeriesList} storiesList={storiesList} setStoriesList={setStoriesList} />;
    } else {
      return <SplashPage />;
    }
  };

  if (userLoading || navLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="App">
      <main>
        <header>
          <UserMenu />
          <h4>
            <span>D</span>octer<span className="tld">.io</span>
            <div className="version">ver 1.0.1</div>
          </h4>
        </header>
        {renderContent()}
        <CreatEditStoryPanel seriesList={seriesList} setSeriesList={setSeriesList} storiesList={storiesList} setStoriesList={setStoriesList} />
        <ConfigPanelModal />
        <LoginPanelModal />
      </main>
      <Elements stripe={stripePromise}>
        <SubscribePanel />
      </Elements>
    </div>
  );
});
