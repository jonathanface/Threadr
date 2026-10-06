/*
 * Copyright © 2026 Type3 Solutions, Inc. All rights reserved.
 *
 * This file is part of the proprietary software developed by Type3 Solutions, Inc.
 * Unauthorized copying, modification, distribution, or use of this file, via any medium,
 * is strictly prohibited unless explicitly authorized in writing by Type3 Solutions, Inc.
 *
 * This software is confidential and proprietary and may contain trade secrets or other
 * information that is protected by law or contract. Use and disclosure are restricted.
 *
 * For internal use only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import { LoginPanel } from "../index";

const renderWithRouter = (
  ui: React.ReactElement,
  initialEntries = ["/signin"],
) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
  );
};

const mockWindowLocation = (search: string) => {
  Object.defineProperty(window, "location", {
    value: { search, pathname: "/signin", href: "/signin" + search },
    writable: true,
  });
};

describe("LoginPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation("");
  });

  describe("Rendering", () => {
    it("should render without crashing", () => {
      renderWithRouter(<LoginPanel />);
      expect(
        screen.getByRole("heading", { name: "Sign In" }),
      ).toBeInTheDocument();
    });

    it("should render Google login option", () => {
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole("link", {
        name: /sign in with google/i,
      });
      expect(googleLink).toBeInTheDocument();
      expect(googleLink).toHaveAttribute("href", "/auth/google");
      expect(googleLink).toHaveAttribute("id", "LoginWithGoogle");
    });

    it("should render Amazon login option", () => {
      renderWithRouter(<LoginPanel />);

      const amazonLink = screen.getByRole("link", {
        name: /sign in with amazon/i,
      });
      expect(amazonLink).toBeInTheDocument();
      expect(amazonLink).toHaveAttribute("href", "/auth/amazon");
      expect(amazonLink).toHaveAttribute("id", "LoginWithAmazon");
    });

    it("should render GitHub login option", () => {
      renderWithRouter(<LoginPanel />);

      const githubLink = screen.getByRole("link", {
        name: /sign in with github/i,
      });
      expect(githubLink).toBeInTheDocument();
      expect(githubLink).toHaveAttribute("href", "/auth/github");
      expect(githubLink).toHaveAttribute("id", "LoginWithGitHub");
    });

    it("should render email/password form", () => {
      renderWithRouter(<LoginPanel />);

      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it("should render forgot password and create account links", () => {
      renderWithRouter(<LoginPanel />);

      expect(screen.getByText("Forgot password?")).toBeInTheDocument();
      expect(screen.getByText("Create an account")).toBeInTheDocument();
    });

    it("should render divider between OAuth and email form", () => {
      renderWithRouter(<LoginPanel />);

      expect(screen.getByText("or sign in with email")).toBeInTheDocument();
    });
  });

  describe("Query String Handling", () => {
    it("should preserve query string in Google auth link", () => {
      mockWindowLocation("?redirect=/stories");
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole("link", {
        name: /sign in with google/i,
      });
      expect(googleLink).toHaveAttribute(
        "href",
        "/auth/google?redirect=/stories",
      );
    });

    it("should preserve query string in Amazon auth link", () => {
      mockWindowLocation("?redirect=/stories");
      renderWithRouter(<LoginPanel />);

      const amazonLink = screen.getByRole("link", {
        name: /sign in with amazon/i,
      });
      expect(amazonLink).toHaveAttribute(
        "href",
        "/auth/amazon?redirect=/stories",
      );
    });

    it("should preserve query string in GitHub auth link", () => {
      mockWindowLocation("?redirect=/stories");
      renderWithRouter(<LoginPanel />);

      const githubLink = screen.getByRole("link", {
        name: /sign in with github/i,
      });
      expect(githubLink).toHaveAttribute(
        "href",
        "/auth/github?redirect=/stories",
      );
    });

    it("should handle empty query string", () => {
      mockWindowLocation("");
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole("link", {
        name: /sign in with google/i,
      });
      const amazonLink = screen.getByRole("link", {
        name: /sign in with amazon/i,
      });
      const githubLink = screen.getByRole("link", {
        name: /sign in with github/i,
      });

      expect(googleLink).toHaveAttribute("href", "/auth/google");
      expect(amazonLink).toHaveAttribute("href", "/auth/amazon");
      expect(githubLink).toHaveAttribute("href", "/auth/github");
    });
  });

  describe("Success Messages", () => {
    it("should show verified message when verified=true in params", () => {
      renderWithRouter(<LoginPanel />, ["/signin?verified=true"]);

      expect(
        screen.getByText(/email verified successfully/i),
      ).toBeInTheDocument();
    });

    it("should show reset message when reset=true in params", () => {
      renderWithRouter(<LoginPanel />, ["/signin?reset=true"]);

      expect(
        screen.getByText(/password reset successfully/i),
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have descriptive text on OAuth buttons", () => {
      renderWithRouter(<LoginPanel />);

      expect(
        screen.getByRole("link", { name: /sign in with google/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /sign in with amazon/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /sign in with github/i }),
      ).toBeInTheDocument();
    });

    it("should have proper heading structure", () => {
      renderWithRouter(<LoginPanel />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Sign In");
    });

    it("should have valid links", () => {
      renderWithRouter(<LoginPanel />);

      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(5); // Google, Amazon, GitHub, Forgot password, Create account
      links.forEach((link) => {
        expect(link).toHaveAttribute("href");
      });
    });
  });

  describe("Close Button", () => {
    it("should render close button", () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByRole("button", { name: /go back/i });
      expect(closeButton).toBeInTheDocument();
    });

    it("should have accessible label on close button", () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByLabelText("Go back");
      expect(closeButton).toBeInTheDocument();
    });

    it("should be clickable", () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByRole("button", { name: /go back/i });
      expect(() => fireEvent.click(closeButton)).not.toThrow();
    });
  });
});
