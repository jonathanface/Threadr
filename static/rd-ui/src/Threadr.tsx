import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

import { useEffect, useMemo, useState } from "react";
import "./css/main.css";
import { ConfigPanelModal } from "./sections/ConfigPanel";
import { DocumentEditor } from "./sections/DocumentEditor";
import { LoginPanelModal } from "./sections/LoginPanelModal";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { Subscribe } from "./sections/Subscribe";
import { UserMenu } from "./sections/UserMenu";

import { useHandleNavigationHandler } from "./hooks/useNavigationHandler";
import { StoryAction, useCurrentStoryContext } from "./contexts/selections";
import { useFetchUserData } from "./hooks/useFetchUserData";

export const Threadr = () => {

  const { isLoggedIn, isLoadingUser } = useFetchUserData();
  const { handleNavChange } = useHandleNavigationHandler();
  const stripeKey: string = import.meta.env.VITE_STRIPE_KEY ?? "";
  const [stripe] = useState(() => loadStripe(stripeKey));

  const { currentStory, currentStoryAction } = useCurrentStoryContext();
  const [displayComponent, setDisplayComponent] = useState(<div />);

  useEffect(() => {
    handleNavChange();
  }, [handleNavChange]);

  const renderContent = useMemo(() => {
    if (
      isLoggedIn &&
      currentStory &&
      currentStoryAction === StoryAction.viewing
    )
      return <DocumentEditor />;
    if (
      (isLoggedIn && !currentStory) ||
      (isLoggedIn && currentStory && currentStoryAction === StoryAction.none)
    )
      return <StoryAndSeriesListing />;
    if (isLoadingUser) return <div />;
    return <SplashPage />;
  }, [isLoggedIn, currentStory, currentStoryAction, isLoadingUser]);

  useEffect(() => {
    setDisplayComponent(renderContent);
  }, [isLoggedIn, isLoadingUser, currentStory, currentStoryAction])


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
        {displayComponent}
        {/* <CreateNewStoryModal />
        <EditStoryModal />
        <EditSeriesModal /> */}
        <ConfigPanelModal />
        <LoginPanelModal />
      </main>
      <Elements stripe={stripe}>
        <Subscribe />
      </Elements>
    </div>
  );
}

