// src/sections/billing/__tests__/AccountSubscriptionPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Component under test (adjust path if yours differs)
import { AccountSubscriptionPage } from "../AccountSubscription";

// ---- API mocks ----
const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("../../../api", () => {
  return {
    api: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (...args: any[]) => getMock(...args),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      post: (...args: any[]) => postMock(...args),
    },
  };
});

// ---- window.location helpers (assign is non-configurable in jsdom) ----
const originalLocation = window.location;
function stubLocation(href = "http://localhost/account/subscription") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).location;
  // @ts-expect-error – partial is fine for tests
  window.location = {
    ...originalLocation,
    href,
    assign: vi.fn(),
  };
}
function restoreLocation() {
  // @ts-expect-error //mocking location
  window.location = originalLocation;
}

// ---- small util to keep promises pending when needed ----
function createDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  restoreLocation();
});

describe("<AccountSubscriptionPage />", () => {
  it("shows a loader initially and disables the button while loading", async () => {
    const d = createDeferred<{ data: { status: string } }>();
    getMock.mockReturnValueOnce(d.promise);

    render(<AccountSubscriptionPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    // finish the request to avoid leaking pending promises
    d.resolve({ data: { status: "active" } });
    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
  });

  it("renders an error chip when the summary request fails and disables the button", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));

    render(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^error$/i)).toBeInTheDocument(),
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("shows ACTIVE status and a 'MANAGE BILLING' CTA when status is active", async () => {
    getMock.mockResolvedValueOnce({ data: { status: "active" } });

    render(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^ACTIVE$/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /manage billing/i }),
    ).toBeInTheDocument();
  });

  it("shows NONE status and a 'JOIN NOW' CTA when not subscribed", async () => {
    getMock.mockResolvedValueOnce({ data: { status: "none" } });

    render(<AccountSubscriptionPage />);

    await waitFor(() => expect(screen.getByText(/^NONE$/)).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /join now/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'MANAGE BILLING' posts to portal session and redirects to returned URL", async () => {
    stubLocation();
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { status: "active" } });

    const d = createDeferred<{ data: { url: string } }>();
    postMock.mockReturnValueOnce(d.promise);

    render(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^ACTIVE$/)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    // resolve the portal call
    d.resolve({ data: { url: "https://stripe.test/portal/xyz" } });

    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://stripe.test/portal/xyz",
      ),
    );

    // Verify API call shape and header
    expect(postMock).toHaveBeenCalledWith(
      "/billing/portal-session",
      null,
      expect.objectContaining({
        baseURL: "",
        headers: expect.objectContaining({
          "X-Return-Url": "http://localhost/account/subscription",
        }),
      }),
    );
  });

  it("clicking 'JOIN NOW' navigates to /subscribe when status is NONE", async () => {
    stubLocation();
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { status: "none" } });

    render(<AccountSubscriptionPage />);

    await waitFor(() => expect(screen.getByText(/^NONE$/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /join now/i }));

    expect(window.location.assign).toHaveBeenCalledWith("/subscribe");
    expect(postMock).not.toHaveBeenCalled(); // no portal call on NONE
  });

  it("shows an error chip if opening the billing portal fails", async () => {
    stubLocation();
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { status: "trialing" } });
    postMock.mockRejectedValueOnce(new Error("nope"));

    render(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^TRIALING$/)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    await waitFor(() =>
      expect(screen.getByText(/^error$/i)).toBeInTheDocument(),
    );
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
