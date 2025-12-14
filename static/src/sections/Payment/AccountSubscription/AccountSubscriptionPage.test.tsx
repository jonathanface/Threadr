// src/sections/billing/__tests__/AccountSubscriptionPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

// Component under test (adjust path if yours differs)
import { AccountSubscriptionPage } from "../AccountSubscription";

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
    <MemoryRouter initialEntries={["/account/subscription"]}>{ui}</MemoryRouter>,
  );
}

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

const originalLocation = window.location;

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
  mockNavigate.mockReset();
  restoreLocation();
});

describe("<AccountSubscriptionPage />", () => {
  it("shows a loader initially and disables the button while loading", async () => {
    const d = createDeferred<{ data: { status: string } }>();
    getMock.mockReturnValueOnce(d.promise);

    renderWithRouter(<AccountSubscriptionPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /join now/i });
    expect(button).toBeDisabled();

    // finish the request to avoid leaking pending promises
    d.resolve({ data: { status: "active" } });
    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
  });

  it("renders an error chip when the summary request fails and disables the button", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));

    renderWithRouter(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^error$/i)).toBeInTheDocument(),
    );
    const button = screen.getByRole("button", { name: /join now/i });
    expect(button).toBeDisabled();
  });

  it("shows ACTIVE status and a 'MANAGE BILLING' CTA when status is active", async () => {
    getMock.mockResolvedValueOnce({ data: { status: "active" } });

    renderWithRouter(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^ACTIVE$/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /manage billing/i }),
    ).toBeInTheDocument();
  });

  it("shows NONE status and a 'JOIN NOW' CTA when not subscribed", async () => {
    getMock.mockResolvedValueOnce({ data: { status: "none" } });

    renderWithRouter(<AccountSubscriptionPage />);

    await waitFor(() => expect(screen.getByText(/^NONE$/)).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /join now/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'MANAGE BILLING' posts to portal session and redirects to returned URL", async () => {
    stubLocation("http://localhost/account/subscription"); // <-- set the href you expect
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { status: "active" } });

    const d = createDeferred<{ data: { url: string } }>();
    postMock.mockReturnValueOnce(d.promise);

    renderWithRouter(<AccountSubscriptionPage />);

    await waitFor(() =>
      expect(screen.getByText(/^ACTIVE$/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    d.resolve({ data: { url: "https://stripe.test/portal/xyz" } });

    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://stripe.test/portal/xyz",
      ),
    );

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

    renderWithRouter(<AccountSubscriptionPage />);

    await waitFor(() => expect(screen.getByText(/^NONE$/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /join now/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/subscribe");
    expect(postMock).not.toHaveBeenCalled(); // no portal call on NONE
  });

  it("shows an error chip if opening the billing portal fails", async () => {
    stubLocation();
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { status: "trialing" } });
    postMock.mockRejectedValueOnce(new Error("nope"));

    renderWithRouter(<AccountSubscriptionPage />);

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
