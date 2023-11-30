import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "../../css/subscribe.css";

import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import {
  setAlertMessage,
  setAlertOpen,
  setAlertSeverity,
  setAlertTimeout,
  setAlertTitle,
} from "../../stores/alertSlice";
import { setSubscriptionFormOpen } from "../../stores/uiSlice";

const Subscribe = () => {
  const [customerID, setCustomerID] = useState("");
  const [subscribeError, setSubscribeError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [product, setProduct] = useState({});

  const isOpen = useSelector((state) => state.ui.subscriptionFormOpen);
  const dispatch = useDispatch();

  const stripe = useStripe();
  const elements = useElements();

  const handleClose = () => {
    dispatch(setSubscriptionFormOpen(false));
  };

  const confirmCard = async () => {
    setSubscribeError("");
    fetch("/billing/card", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: customerID }),
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("Fetch problem create customer " + response.status);
      })
      .then(async (data) => {
        const cardElement = elements.getElement(CardElement);
        // Create a payment method and handle the result
        const { paymentMethod, error } = await stripe.createPaymentMethod({
          customerID: data.customerID,
          type: "card",
          card: cardElement,
        });
        if (error) {
          setSubscribeError(error);
          return;
        }

        console.log("confirm", paymentMethod);
        setPaymentMethod({
          id: paymentMethod.id,
          brand: paymentMethod.card.brand,
          last_four: paymentMethod.card.last4,
        });

        fetch("/billing/customer", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ customer_id: customerID, payment_method_id: paymentMethod.id }),
        })
          .then((response) => {
            if (response.ok) {
              return response.json();
            }
            throw new Error("Fetch problem update customer " + response.status);
          })
          .then(async (data) => {});
      });
  };

  const getOrCreateStripeCustomer = async () => {
    try {
      const response = await fetch("/billing/customer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Fetch problem create customer " + response.status);
      }
      const json = await response.json();
      setCustomerID(json.id);
      if (json.payment_methods && json.payment_methods.length) {
        const defaultPayment = json.payment_methods.filter((method) => method.is_default === true);
        if (defaultPayment.length) {
          setPaymentMethod(defaultPayment[0]);
        }
      }
    } catch (error) {
      handleClose();
      console.error("ERROR", error);
    }
  };

  const subscribe = async () => {
    if (!paymentMethod.id || !price_id) {
      return;
    }
    try {
      const response = await fetch("/billing/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethod.id,
          customer_id: customerID,
          price_id: product.price_id,
        }),
      });
      if (!response.ok) {
        throw new Error("Fetch problem create subscription " + response.status);
      }
      const json = await response.json();

      dispatch(setAlertTitle("Welcome"));
      dispatch(
        setAlertMessage(
          "Your subscription is active until " +
            json.period_end +
            " and will automatically renew. If you had previously subscribed, any suspended stories will be restored in the next 30 minutes."
        )
      );
      dispatch(setAlertSeverity("success"));
      dispatch(setAlertTimeout(10000));
      dispatch(setAlertOpen(true));
      handleClose();
    } catch (error) {
      console.error(error);
      handleClose();
    }
  };

  const getProducts = () => {
    fetch("/billing/products")
      .then((response) => {
        if (response.ok) {
          return response.json();
        }
        throw new Error("Fetch problem getting products " + response.status);
      })
      .then((data) => {
        setProduct(data[0]);
      });
  };

  useEffect(() => {
    if (isOpen) {
      if (!customerID.length) {
        getOrCreateStripeCustomer();
        getProducts();
      }
    }
  }, [isOpen, customerID, paymentMethod]);

  const handleCardElementChange = (e) => {
    if (e.error) {
      console.log(e.error.message);
    }
  };

  const updatePaymentMethod = (e) => {
    setPaymentMethod(null);
    confirmCard();
  };

  return (
    <Dialog open={isOpen} maxWidth={"md"} fullWidth={true} onClose={handleClose} className="subscribe">
      <DialogTitle>{product.name}</DialogTitle>
      <DialogContent>
        {!paymentMethod ? (
          <CardElement onChange={(e) => handleCardElementChange(e)} />
        ) : (
          <DialogContentText>
            <span>
              {product.description + " for only $" + product.billing_amount + " a " + product.billing_frequency}
            </span>
            <br />
            <span>Subscribe with {paymentMethod.brand.toUpperCase() + " ending in " + paymentMethod.last_four}</span>
            <span className="change-payment-button">
              <Button onClick={updatePaymentMethod}>change</Button>
            </span>
          </DialogContentText>
        )}
        {subscribeError && <div>{subscribeError}</div>}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={subscribe}>Subscribe</Button>
      </DialogActions>
    </Dialog>
  );
};

export default Subscribe;
