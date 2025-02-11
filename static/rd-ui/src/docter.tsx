
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

import { memo, useEffect } from "react";
import "./css/main.css";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { SubscribePanel } from "./sections/SubscribePanel";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { HeaderMenu } from "./components/HeaderMenu";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPanel } from "./sections/LoginPanel";
import { ConfigPanel } from "./sections/UserConfigPanel";
import { CreateEditStorySlideshow } from "./sections/CreateEditStorySlideshow";
import { EditSeries } from "./sections/EditSeries";
import { useToaster } from "./hooks/useToaster";
import { AlertCommandType, AlertFunctionCall, AlertToastType } from "./types/AlertToasts";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY ?? "");

export const Docter = memo(() => {
  const { setAlertState } = useToaster();
  const { isLoggedIn, userLoading, userDetails } = useFetchUserData();

  useEffect(() => {
    console.log("Docter mounted");
    return () => {
      console.log("Docter unmounted");
    };
  }, []);

  useEffect(() => {
    if (userDetails?.expired) {
      const subscribeFunc: AlertFunctionCall = {
        type: AlertCommandType.subscribe,
        text: "subscribe",
      };
      setAlertState({
        title: "Your account has expired",
        message: "All except your first-created story has been archived and will be retained for 30 days before permanent deletion. If you wish to renew your subscription, click below.",
        open: true,
        severity: AlertToastType.warning,
        timeout: null,
        callback: subscribeFunc,
      });
    }
  }, [userDetails, setAlertState]);

  if (userLoading) {
    return <div />;
  }

  return (
    <div className="App">
      <HeaderMenu />
      <main>
        <Routes>
          <Route
            path="/stories/:storyID"
            element={
              isLoggedIn ? (
                <DocumentEditorPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/stories"
            element={
              isLoggedIn ? (
                <StoryAndSeriesListing />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/"
            element={isLoggedIn ? (
              <Navigate to="/stories" replace />
            ) : (
              <SplashPage />
            )}
          />
          <Route
            path="/signin"
            element={
              isLoggedIn ? (
                <Navigate to="/stories" replace />
              ) : (
                <LoginPanel />
              )
            }
          />
          <Route
            path="/settings"
            element={
              isLoggedIn ? (
                <ConfigPanel />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/stories/new"
            element={
              isLoggedIn ? (
                <CreateEditStorySlideshow />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/stories/:storyID/edit"
            element={
              isLoggedIn ? (
                <CreateEditStorySlideshow />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/series/:seriesID/edit"
            element={
              isLoggedIn ? (
                <EditSeries />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/subscribe"
            element={
              isLoggedIn ? (
                <Elements stripe={stripePromise}>
                  <SubscribePanel />
                </Elements>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
});
