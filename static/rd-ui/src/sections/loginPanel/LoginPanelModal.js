import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import "../../css/auth.css";
import { flipLoginPanelVisible } from "../../stores/userSlice";

const LoginPanelModal = (props) => {
  const isLoggingIn = useSelector((state) => state.user.loginPanelVisible);
  const dispatch = useDispatch();

  const handleClose = () => {
    dispatch(flipLoginPanelVisible());
  };

  return (
    <Dialog open={isLoggingIn} onClose={handleClose}>
      <DialogTitle>Sigin Options</DialogTitle>
      <DialogContent>
        <p>
          <a href="/auth/google" id="LoginWithGoogle">
            <img
              border="0"
              alt="Login with Google"
              src="https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg"
              width="175"
            />
          </a>
        </p>
        <p>
          <a href="/auth/amazon" id="LoginWithAmazon">
            <img
              border="0"
              alt="Login with Amazon"
              src="https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png"
              width="175"
            />
          </a>
        </p>
        <p>
          <a href="/auth/microsoftonline" id="LoginWithMicrosoft">
            <img
              border="0"
              alt="Login with Micrsoft"
              src="https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_light.png"
              width="175"
            />
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default LoginPanelModal;
