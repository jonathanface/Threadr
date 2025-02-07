
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

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY ?? "");

export const Docter = memo(() => {
  const { isLoggedIn, userLoading } = useFetchUserData();
  useEffect(() => {
    console.log("Docter mounted");
    return () => {
      console.log("Docter unmounted");
    };
  }, []);
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
                null //TO-DO
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
