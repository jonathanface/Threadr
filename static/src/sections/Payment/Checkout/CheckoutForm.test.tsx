// src/sections/billing/__tests__/CheckoutForm.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

// Adjust path if needed
import { CheckoutForm } from "../Checkout";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/checkout"]}>{ui}</MemoryRouter>,
  );
}

// ---- Stripe hook state we can tweak per-test ----
type SubmitResult = { error?: { message?: string } } | object;
type ConfirmResult = { error?: { message?: string } } | object;

const originalLocation = window.location;

let mockStripe: null | {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmPayment: (args: any) => Promise<ConfirmResult>;
};
let mockElements: null | {
  submit: () => Promise<SubmitResult>;
};

function stubLocation(href = "http://localhost/test") {
  // tell TS we're assigning a Location
  (window as unknown as { location: Location }).location = {
    ...originalLocation,
    href,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  } as unknown as Location;
}

function restoreLocation() {
  (window as unknown as { location: Location }).location = originalLocation;
}

// Helpers to set different hook return values per test
const setStripeReady = (opts?: {
  submitResult?: SubmitResult;
  confirmResult?: ConfirmResult;
}) => {
  mockElements = {
    submit: vi.fn(async () => opts?.submitResult ?? {}),
  };
  mockStripe = {
    confirmPayment: vi.fn(async () => opts?.confirmResult ?? {}),
  };
};

const setStripeNotReady = () => {
  mockStripe = null;
  mockElements = null;
};

// 1) Mock stripe-js (not used directly by CheckoutForm)
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}));

// 2) Mock @stripe/react-stripe-js hooks + PaymentElement
vi.mock("@stripe/react-stripe-js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@stripe/react-stripe-js")>();
  return {
    ...actual,
    PaymentElement: () => <div data-testid="payment-element" />,
    useStripe: () => mockStripe,
    useElements: () => mockElements,
    Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

beforeEach(() => {
  setStripeNotReady();
  mockNavigate.mockReset();
  vi.restoreAllMocks();
});

describe("<CheckoutForm />", () => {
  it("disables the submit button until stripe/elements are ready", () => {
    renderWithRouter(<CheckoutForm />);
    const btn = screen.getByRole("button", { name: /start membership/i });
    expect(btn).toBeDisabled();
  });

  it("shows validation error if elements.submit() returns an error", async () => {
    setStripeReady({ submitResult: { error: { message: "Fix your fields" } } });
    const user = userEvent.setup();

    renderWithRouter(<CheckoutForm />);
    const btn = screen.getByRole("button", { name: /start membership/i });
    expect(btn).toBeEnabled();

    await user.click(btn);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Fix your fields"),
    );
    // confirmPayment should NOT be called when submit fails
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockStripe as any).confirmPayment).not.toHaveBeenCalled();
  });

  it("shows payment error if confirmPayment() returns an error", async () => {
    setStripeReady({
      submitResult: {},
      confirmResult: { error: { message: "Card declined" } },
    });
    const user = userEvent.setup();

    renderWithRouter(<CheckoutForm />);
    await user.click(screen.getByRole("button", { name: /start membership/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Card declined"),
    );
  });

  it("navigates to /success when payment succeeds without redirect", async () => {
    stubLocation();
    try {
      setStripeReady({ submitResult: {}, confirmResult: {} });
      const user = userEvent.setup();

      renderWithRouter(<CheckoutForm />);
      await user.click(
        screen.getByRole("button", { name: /start membership/i }),
      );

      await waitFor(() =>
        expect(window.location.assign).toHaveBeenCalledWith("/success"),
      );
    } finally {
      restoreLocation();
    }
  });

  it("prevents double-submit while processing", async () => {
    let resolveConfirm!: () => void;
    setStripeReady({
      submitResult: {},
      confirmResult: new Promise<ConfirmResult>((resolve) => {
        resolveConfirm = () => resolve({});
      }) as unknown as ConfirmResult,
    });

    const user = userEvent.setup();
    renderWithRouter(<CheckoutForm />);

    const btn = screen.getByRole("button", { name: /start membership/i });

    // First click kicks off submit
    await user.click(btn);

    // While processing, button should be disabled (prevents doubles)
    expect(btn).toBeDisabled();

    // (No second click attempt; just assert only one confirm call)
    // finish the confirm
    resolveConfirm!();

    // success redirect
    stubLocation();
    try {
      await waitFor(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((mockStripe as any).confirmPayment).toHaveBeenCalledTimes(1),
      );
    } finally {
      restoreLocation();
    }
  });
});
