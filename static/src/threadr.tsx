import "./css/main.css";
import "./css/themes.css";
import { DocumentEditorPage } from "./sections/DocumentEditor";
import { SplashPage } from "./sections/SplashPage";
import { StoryAndSeriesListing } from "./sections/StoryAndSeriesListing";
import { useFetchUserData } from "./hooks/useFetchUserData";
import { HeaderMenu } from "./components/HeaderMenu";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { DEMO_PENDING_CONVERSION_KEY } from "./sections/Demo/storage";
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
import { DemoPage } from "./sections/Demo";
import { ImportDraftPage } from "./sections/Demo/ImportDraftPage";

export const Threadr = () => {
  const { isLoggedIn, userLoading } = useFetchUserData();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoggedIn || userLoading) return;
    if (localStorage.getItem(DEMO_PENDING_CONVERSION_KEY) !== "true") return;
    if (location.pathname === "/import-draft") return;
    navigate("/import-draft", { replace: true });
  }, [isLoggedIn, userLoading, location.pathname, navigate]);

  if (userLoading) {
    return <div />;
  }

  return (
    <div className="App">
      {location.pathname !== "/try" && <HeaderMenu />}
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
          {/* Demo writer (no auth required) */}
          <Route path="/try" element={<DemoPage />} />
          <Route
            path="/import-draft"
            element={
              isLoggedIn ? <ImportDraftPage /> : <Navigate to="/signup?from=demo" replace />
            }
          />
          {/* Catch-all 404 */}
          <Route path="*" element={<NotFoundPage isLoggedIn={isLoggedIn} />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};
