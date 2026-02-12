import { useEffect } from "react";
import "./css/main.css";
import "./css/themes.css";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { HeaderMenu } from "./components/HeaderMenu";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { LoginPanel } from "./sections/LoginPanel";
import { EditSeries } from "./sections/EditSeries";
import { useToaster } from "./hooks/useToaster";

import { CreateOrEditStory } from "./sections/CreateOrEditStory";
import { Footer } from "./components/Footer";
import { MobileAppBanner } from "./components/MobileAppBanner";
import { SubscribePage } from "./sections/Payment/Subscribe";
import { CheckoutPage } from "./sections/Payment/Checkout";
import { SuccessPage } from "./sections/Payment/Success";
import { AccountSubscriptionPage } from "./sections/Payment/AccountSubscription";
import { NotFoundPage } from "./sections/NotFound";
import { AdminArea } from "./sections/AdminArea";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "./types/AlertToasts";

export const Docter = () => {
  const { setAlertState } = useToaster();
  const { isLoggedIn, userLoading } = useFetchUserData();
  const [searchParams] = useSearchParams();


  useEffect(() => {
    if (searchParams.get("restored") === "true") {
      setAlertState({
        title: "Restoring stories",
        message:
          "The stories created during your previous subscription period are being restored. Please allow up to one hour.",
        open: true,
        severity: AlertToastType.info,
        timeout: null,
      });
    } else if (searchParams.get("expired") === "true") {
      const subscribeFunc: AlertFunctionCall = {
        type: AlertCommandType.subscribe,
        text: "subscribe",
      };
      setAlertState({
        title: "Subscription Expired",
        message:
          "Your subscription has expired, and your extra stories have been archived. If you wish to renew your subscription, click below.",
        open: true,
        severity: AlertToastType.warning,
        timeout: null,
        callback: subscribeFunc,
      });
    }
  }, [searchParams, setAlertState]);

  // useEffect(() => {
  //   if (!userDetails?.subscriber) {
  //     const subscribeFunc: AlertFunctionCall = {
  //       type: AlertCommandType.subscribe,
  //       text: "subscribe",
  //     };
  //     setAlertState({
  //       title: "Subscription Expired",
  //       message:
  //         "Your subscription has expired. If you wish to renew your subscription, click below.",
  //       open: true,
  //       severity: AlertToastType.warning,
  //       timeout: null,
  //       callback: subscribeFunc,
  //     });
  //   } else if (userDetails && userDetails.expires_at && !userDetails.renewing) {
  //     const now = Math.floor(Date.now() / 1000);
  //     const twentyFourHoursFromNow = now + 24 * 60 * 60;
  //     if (
  //       parseInt(userDetails.expires_at) >= now &&
  //       parseInt(userDetails.expires_at) <= twentyFourHoursFromNow
  //     ) {
  //       const renewFunc: AlertFunctionCall = {
  //         type: AlertCommandType.renew,
  //         text: "Renew",
  //       };
  //       setAlertState({
  //         title: "Subscription Expiring",
  //         message: `Your subscription will expire at ${new Date(parseInt(userDetails.expires_at) * 1000).toLocaleString()} and you will lose access to members-only features.\n\nIf you wish to renew your subscription, click below.`,
  //         open: true,
  //         severity: AlertToastType.warning,
  //         timeout: null,
  //         callback: renewFunc,
  //       });
  //     }
  //   }
  // }, [userDetails, setAlertState]);

  if (userLoading) {
    return <div />;
  }

  return (
    <div className="App">
      <HeaderMenu />
      <MobileAppBanner />
      <main>
        <Routes>
          <Route
            path="/stories/:storyID"
            element={
              isLoggedIn ? <DocumentEditorPage /> : <Navigate to="/" replace />
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
            element={
              isLoggedIn ? <Navigate to="/stories" replace /> : <SplashPage />
            }
          />
          <Route
            path="/signin"
            element={
              isLoggedIn ? <Navigate to="/stories" replace /> : <LoginPanel />
            }
          />
          <Route
            path="/account/subscription"
            element={
              isLoggedIn ? (
                <AccountSubscriptionPage />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/stories/new"
            element={
              isLoggedIn ? <CreateOrEditStory /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/stories/:storyID/edit"
            element={
              isLoggedIn ? <CreateOrEditStory /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/series/:seriesID/add"
            element={
              isLoggedIn ? <CreateOrEditStory /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/series/:seriesID/edit"
            element={isLoggedIn ? <EditSeries /> : <Navigate to="/" replace />}
          />
          <Route
            path="/subscribe"
            element={
              isLoggedIn ? <SubscribePage /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/checkout"
            element={
              isLoggedIn ? <CheckoutPage /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/success"
            element={isLoggedIn ? <SuccessPage /> : <Navigate to="/" replace />}
          />
          <Route
            path="/admin"
            element={isLoggedIn ? <AdminArea /> : <Navigate to="/" replace />}
          />
          {/* Catch-all 404 */}
          <Route path="*" element={<NotFoundPage isLoggedIn={isLoggedIn} />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};
