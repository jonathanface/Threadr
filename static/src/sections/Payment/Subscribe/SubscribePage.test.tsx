import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

import { SubscribePage } from "../Subscribe";

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
    <MemoryRouter initialEntries={["/subscribe"]}>{ui}</MemoryRouter>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
});

describe("<SubscribePage />", () => {
  it("renders the title and price copy", () => {
    renderWithRouter(<SubscribePage />);

    expect(
      screen.getByRole("heading", { name: /full membership/i, level: 2 }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/\$5\s*\/\s*month — unlimited access/i),
    ).toBeInTheDocument();
  });

  it("shows the included features list", () => {
    renderWithRouter(<SubscribePage />);

    const features = [
      /unlimited documents/i,
      /unlimited associations/i,
      /export to other formats/i,
      /cancel anytime/i,
    ];

    for (const feature of features) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }
  });

  it("shows the Stripe secure checkout note", () => {
    renderWithRouter(<SubscribePage />);

    // Icon presence is MUI-specific; we at least assert the text is present.
    expect(screen.getByText(/secure checkout by stripe/i)).toBeInTheDocument();
  });

  it("links to Terms and Privacy Policy", () => {
    renderWithRouter(<SubscribePage />);

    const terms = screen.getByRole("link", { name: /terms/i });
    const privacy = screen.getByRole("link", { name: /privacy policy/i });

    expect(terms).toBeInTheDocument();
    expect(privacy).toBeInTheDocument();

    // In jsdom, href becomes absolute (http://localhost/terms). Accept either.
    expect(terms.getAttribute("href") ?? "").toMatch(/\/terms.html$/);
    expect(privacy.getAttribute("href") ?? "").toMatch(/\/privacy.html$/);
  });

  it("navigates to /checkout when the subscribe button is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SubscribePage />);

    const cta = screen.getByRole("button", { name: /subscribe for \$5\/mo/i });
    expect(cta).toBeInTheDocument();

    await user.click(cta);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/checkout");
  });
});
