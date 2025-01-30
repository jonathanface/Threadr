
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

import { memo, useEffect } from "react";
import "./css/main.css";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { SubscribePanel } from "./sections/SubscribePanel";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { useWorksList } from "./hooks/useWorksList";
import { HeaderMenu } from "./components/HeaderMenu";
import { Navigate, Route, Routes } from "react-router-dom";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_KEY ?? "");

export const Docter = memo(() => {
  const { isLoggedIn, userLoading } = useFetchUserData();
  const { seriesList, setSeriesList, storiesList, setStoriesList } = useWorksList();
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
                <StoryAndSeriesListing seriesList={seriesList} setSeriesList={setSeriesList} storiesList={storiesList} setStoriesList={setStoriesList} />
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
        </Routes>
        {/* <CreatEditStoryPanel seriesList={seriesList} setSeriesList={setSeriesList} storiesList={storiesList} setStoriesList={setStoriesList} />
        <ConfigPanelModal />
        <LoginPanelModal /> */}
      </main>
      <Elements stripe={stripePromise}>
        <SubscribePanel />
      </Elements>
    </div>
  );
});
