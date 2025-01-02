import { useCallback, useEffect, useState } from "react";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import styles from "./subscribe.module.css";

import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import { setAlert } from "../../stores/alertSlice";
import { AppDispatch, RootState } from "../../stores/store";
import { setIsSubscriptionFormOpen } from "../../stores/uiSlice";
import { StripeCardElementChangeEvent } from "@stripe/stripe-js";
import { AlertToast, AlertToastType } from "../../types/AlertToasts";

interface PaymentMethod {
  id: string;
  brand: string;
  last_four: string;
  is_default?: boolean;
}

interface Product {
  product_id: string;
  price_id: string;
  name: string;
  description: string;
  billing_amount: string;
  billing_frequency: string;
}

export const Subscribe = () => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
  const dispatch = useAppDispatch();
  const [customerID, setCustomerID] = useState("");
  const [subscribeError, setSubscribeError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null
  );
  const [product, setProduct] = useState<Product | null>(null);

  const isOpen = useAppSelector((state) => state.ui.isSubscriptionFormOpen);

  const stripe = useStripe();
  const elements = useElements();

  const handleClose = useCallback(() => {
    dispatch(setIsSubscriptionFormOpen(false));
  }, [dispatch]);

  const confirmCard = async () => {
    setSubscribeError("");
    try {
      if (!stripe || !elements) {
        throw new Error("stripe is not available");
      }
      const response = await fetch("/billing/card", {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: customerID }),
      });
      if (!response.ok) {
        throw new Error("Fetch problem create customer " + response.status);
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("card element not found");
      }
      // Create a payment method and handle the result
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        //customerID: json.customerID,
        type: "card",
        card: cardElement,
      });
      if (error) {
        throw new Error(error.message);
      }

      if (
        paymentMethod.id &&
        paymentMethod.card?.brand &&
        paymentMethod.card?.last4
      ) {
        setPaymentMethod({
          id: paymentMethod.id,
          brand: paymentMethod.card?.brand
            ? paymentMethod.card.brand
            : "Unknown",
          last_four: paymentMethod.card?.last4,
        });
        const setPaymentResults = await fetch("/billing/customer", {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_id: customerID,
            payment_method_id: paymentMethod.id,
          }),
        });
        if (!setPaymentResults.ok) {
          throw new Error(
            "Fetch problem update customer " + setPaymentResults.status
          );
        }
      }
    } catch (error: unknown) {
      setSubscribeError((error as Error).message);
    }
  };

  const getOrCreateStripeCustomer = useCallback(async () => {
    try {
      const response = await fetch("/billing/customer", {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Fetch problem create customer " + response.status);
      }
      const json = await response.json();
      if (json && json.id) {
        setCustomerID(json.id);
        if (json.payment_methods && json.payment_methods.length) {
          const defaultPayment = json.payment_methods.filter(
            (method: PaymentMethod) => method.is_default === true
          );
          if (defaultPayment.length) {
            setPaymentMethod(defaultPayment[0]);
          }
        }
      }
    } catch (error) {
      handleClose();
      console.error("ERROR", error);
    }
  }, [setCustomerID, setPaymentMethod, handleClose]);

  const subscribe = async () => {
    if (!paymentMethod || !product) {
      return;
    }
    try {
      const response = await fetch("/billing/subscribe", {
        credentials: "include",
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

      const newAlert: AlertToast = {
        title: "Welcome",
        message:
          "Your subscription is active until " +
          json.period_end +
          " and will automatically renew. If you had previously subscribed, any suspended stories will be restored in the next 30 minutes.",
        severity: AlertToastType.success,
        timeout: 10000,
        open: true,
      };
      dispatch(setAlert(newAlert));
      handleClose();
    } catch (error) {
      console.error(error);
      handleClose();
    }
  };

  const getProducts = () => {
    fetch("/billing/products", {
      credentials: "include",
    })
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
  }, [isOpen, customerID, paymentMethod, getOrCreateStripeCustomer]);

  const handleCardElementChange = (e: StripeCardElementChangeEvent) => {
    if (e.error) {
      console.error(e.error.message);
    }
    if (e.complete) {
      confirmCard();
    }
  };

  const updatePaymentMethod = () => {
    setPaymentMethod(null);
    confirmCard();
  };

  return (
    <Dialog
      open={isOpen}
      maxWidth={"md"}
      fullWidth={true}
      onClose={handleClose}
      className={styles.subscribe}
    >
      {product ? (
        <div>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogContent>
            <div className={styles.productDescription}>
              {product.description}
            </div>
            {!paymentMethod ? (
              <CardElement
                className={styles.stripeCardInput}
                onChange={(e) => handleCardElementChange(e)}
              />
            ) : (
              <DialogContentText>
                <span>{product.description}</span>
                <br />
                <span>
                  Subscribe with{" "}
                  {paymentMethod.brand.toUpperCase() +
                    " ending in " +
                    paymentMethod.last_four}
                </span>
                <span className={styles.changePaymentButton}>
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
        </div>
      ) : (
        <div>
          <h2>
            Unable to process subscriptions at this time. Please try again
            later.
          </h2>
        </div>
      )}
    </Dialog>
  );
};
