// src/sections/billing/__tests__/CheckoutPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// IMPORTANT: adjust the import to where your component lives
import { CheckoutPage } from "../Checkout";

// ---- Mocks ----

// 1) Mock axios api used by the page
const postMock = vi.fn();
vi.mock("../../../api", () => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { post: (...args: any[]) => postMock(...args) },
  };
});

// 2) Mock Stripe libs so loadStripe() doesn’t hit network and <Elements> just renders children
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue({}), // value unused by our mocked <Elements>
}));

vi.mock("@stripe/react-stripe-js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@stripe/react-stripe-js")>();
  return {
    ...actual,
    Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PaymentElement: () => <div data-testid="payment-element" />,
    useStripe: () => null,
    useElements: () => null,
  };
});

beforeEach(() => {
  postMock.mockReset();
});

describe("<CheckoutPage />", () => {
  it("shows a loader initially", () => {
    // keep the promise pending so loader remains visible for this assertion
    postMock.mockReturnValue(new Promise(() => {}));

    render(<CheckoutPage />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the payment form when clientSecret is returned", async () => {
    postMock.mockResolvedValueOnce({ data: { clientSecret: "cs_test_123" } });

    render(<CheckoutPage />);

    // Wait for loader to go away and the PaymentElement to appear
    await waitFor(() =>
      expect(screen.getByTestId("payment-element")).toBeInTheDocument(),
    );

    // Subtle sanity: API was called once with expected endpoint
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      "/billing/subscribe",
      {},
      { baseURL: "" },
    );
  });

  it("shows an error alert if the server call fails", async () => {
    postMock.mockRejectedValueOnce(new Error("boom"));

    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("shows a 'missing client secret' error if API response has none", async () => {
    postMock.mockResolvedValueOnce({ data: {} });

    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /missing client secret/i,
      ),
    );
  });

  it("only calls the subscribe endpoint once (StrictMode guard)", async () => {
    postMock.mockResolvedValueOnce({ data: { clientSecret: "cs_123" } });

    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
