import "./css/main.css";
import "./css/themes.css";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { HeaderMenu } from "./components/HeaderMenu";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPanel } from "./sections/LoginPanel";
import { EditSeries } from "./sections/EditSeries";

import { CreateOrEditStory } from "./sections/CreateOrEditStory";
import { Footer } from "./components/Footer";
import { MobileAppBanner } from "./components/MobileAppBanner";
import { SubscribePage } from "./sections/Payment/Subscribe";
import { CheckoutPage } from "./sections/Payment/Checkout";
import { SuccessPage } from "./sections/Payment/Success";
import { AccountSubscriptionPage } from "./sections/Payment/AccountSubscription";
import { NotFoundPage } from "./sections/NotFound";
import { AdminArea } from "./sections/AdminArea";
import { SharedReaderPage } from "./sections/SharedReader";
import { SignupPanel } from "./sections/SignupPanel";
import { VerifyEmailPage } from "./sections/VerifyEmail";
import { ForgotPasswordPage } from "./sections/ForgotPassword";
import { ResetPasswordPage } from "./sections/ResetPassword";
import { LinkAccountPage } from "./sections/LinkAccount";

export const Threadr = () => {
  const { isLoggedIn, userLoading } = useFetchUserData();

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
            path="/signup"
            element={
              isLoggedIn ? <Navigate to="/stories" replace /> : <SignupPanel />
            }
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/forgot-password"
            element={
              isLoggedIn ? <Navigate to="/stories" replace /> : <ForgotPasswordPage />
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/link-account" element={<LinkAccountPage />} />
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
          {/* Shared reader (no auth required) */}
          <Route path="/shared/:token" element={<SharedReaderPage />} />
          {/* Catch-all 404 */}
          <Route path="*" element={<NotFoundPage isLoggedIn={isLoggedIn} />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};
