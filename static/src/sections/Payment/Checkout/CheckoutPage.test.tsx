// src/sections/billing/__tests__/CheckoutPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

import { CheckoutPage } from "../Checkout";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CheckoutPage />
    </MemoryRouter>,
  );
}

// ---- Mocks ----

const postMock = vi.fn();
vi.mock("../../../api", () => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { post: (...args: any[]) => postMock(...args) },
  };
});

// Mock Stripe libs so loadStripe() doesn't hit network and <Elements> just renders children
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
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
  mockNavigate.mockReset();
});

describe("<CheckoutPage />", () => {
  it("renders the promo-code input on load (no auto-submit)", () => {
    renderAt("/checkout");

    expect(screen.getByLabelText(/Promo code/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue to payment/i }),
    ).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("auto-fires the subscribe call when ?promo= is in the URL", async () => {
    postMock.mockResolvedValueOnce({ data: { client_secret: "cs_test_123" } });

    renderAt("/checkout?promo=WELCxyz");

    // Shows the "Applying your promo code…" loader, not the form.
    expect(screen.getByText(/Applying your promo code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Promo code/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/billing/subscribe",
        { promo_code: "WELCxyz" },
        { baseURL: "" },
      );
    });
  });

  it("falls back to the form with the bad code pre-filled when auto-fire fails", async () => {
    postMock.mockRejectedValueOnce({
      response: { data: { error: "promo code has expired" } },
    });

    renderAt("/checkout?promo=OLDCODE");

    // After the error, the form re-appears with the bad code pre-filled.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/expired/i);
    });
    const input = screen.getByLabelText(/Promo code/i) as HTMLInputElement;
    expect(input.value).toBe("OLDCODE");
  });

  it("sends the typed promo code to /billing/subscribe on Continue", async () => {
    postMock.mockResolvedValueOnce({ data: { client_secret: "cs_test_123" } });

    renderAt("/checkout");

    const input = screen.getByLabelText(/Promo code/i);
    fireEvent.change(input, { target: { value: "FREE1MONTH" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Continue to payment/i }),
    );

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/billing/subscribe",
        { promo_code: "FREE1MONTH" },
        { baseURL: "" },
      );
    });
  });

  it("transitions to the Stripe PaymentElement on successful subscribe", async () => {
    postMock.mockResolvedValueOnce({ data: { client_secret: "cs_test_123" } });

    renderAt("/checkout");

    fireEvent.click(
      screen.getByRole("button", { name: /Continue to payment/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("payment-element")).toBeInTheDocument(),
    );
  });

  it("shows a backend error message and allows retry", async () => {
    postMock.mockRejectedValueOnce({
      response: { data: { error: "promo code not found" } },
    });

    renderAt("/checkout");

    fireEvent.change(screen.getByLabelText(/Promo code/i), {
      target: { value: "BOGUS" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Continue to payment/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /promo code not found/i,
      ),
    );

    // The Continue button is re-enabled so the user can fix the code and retry.
    expect(
      screen.getByRole("button", { name: /Continue to payment/i }),
    ).toBeEnabled();
  });
});
