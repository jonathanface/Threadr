// src/sections/billing/__tests__/SuccessPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Adjust import path if your tree differs
import { SuccessPage } from "../Success";

// ---- Mocks ----
const postMock = vi.fn();

vi.mock("../../../api", () => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api: { post: (...args: any[]) => postMock(...args) },
  };
});

// Helpers for window.location (assign is non-configurable in jsdom)
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

beforeEach(() => {
  postMock.mockReset();
  restoreLocation();
});

describe("<SuccessPage />", () => {
  it("renders success copy and the Manage Billing button", () => {
    render(<SuccessPage />);

    expect(
      screen.getByRole("heading", { name: /you're all set!/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your membership is active/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /manage billing/i }),
    ).toBeInTheDocument();
  });

  it("opens the billing portal and redirects on success", async () => {
    stubLocation("http://localhost/success");
    const user = userEvent.setup();

    postMock.mockResolvedValueOnce({
      data: { url: "https://stripe.test/portal/abc" },
    });

    render(<SuccessPage />);

    // Click the CTA
    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    // After resolve, we should navigate to the returned URL
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://stripe.test/portal/abc",
      ),
    );

    // Assert API call shape
    expect(postMock).toHaveBeenCalledTimes(1);
    const expectedHeaders = expect.objectContaining({
      baseURL: "",
      headers: expect.objectContaining({
        "X-Return-Url": "http://localhost/success",
      }),
    });
    expect(postMock).toHaveBeenCalledWith(
      "/billing/portal-session",
      null,
      expectedHeaders,
    );
  });

  it("shows an error chip if the portal request fails", async () => {
    stubLocation("http://localhost/success");
    const user = userEvent.setup();

    postMock.mockRejectedValueOnce(new Error("nope"));

    render(<SuccessPage />);

    await user.click(screen.getByRole("button", { name: /manage billing/i }));

    // Error state appears (MUI Chip with label 'Error')
    await waitFor(() =>
      expect(screen.getByText(/^error$/i)).toBeInTheDocument(),
    );

    // No redirect should occur
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
