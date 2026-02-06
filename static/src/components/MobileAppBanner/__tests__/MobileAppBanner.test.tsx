import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MobileAppBanner } from "../index";

// Mock useMediaQuery from MUI
vi.mock("@mui/material", () => ({
  useMediaQuery: vi.fn(),
}));

import { useMediaQuery } from "@mui/material";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=io.docter.mobile";
const STORAGE_KEY = "mobileAppBannerDismissed";

describe("MobileAppBanner", () => {
  const mockUseMediaQuery = vi.mocked(useMediaQuery);
  let localStorageMock: { [key: string]: string };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset localStorage mock
    localStorageMock = {};
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => localStorageMock[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageMock[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageMock[key];
        }),
        clear: vi.fn(() => {
          localStorageMock = {};
        }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Mobile Detection", () => {
    it("should render banner on mobile devices when not dismissed", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(screen.getByText("Get the Docter app")).toBeInTheDocument();
      expect(screen.getByText("Download on Google Play")).toBeInTheDocument();
    });

    it("should not render banner on desktop devices", () => {
      mockUseMediaQuery.mockReturnValue(false);

      render(<MobileAppBanner />);

      expect(screen.queryByText("Get the Docter app")).not.toBeInTheDocument();
    });

    it("should call useMediaQuery with correct breakpoint", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(mockUseMediaQuery).toHaveBeenCalledWith("(max-width: 600px)");
    });
  });

  describe("Dismiss Functionality", () => {
    it("should not render if previously dismissed", () => {
      mockUseMediaQuery.mockReturnValue(true);
      localStorageMock[STORAGE_KEY] = "true";

      render(<MobileAppBanner />);

      expect(screen.queryByText("Get the Docter app")).not.toBeInTheDocument();
    });

    it("should save to localStorage when dismissed", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const closeButton = screen.getByRole("button", {
        name: "Dismiss banner",
      });
      fireEvent.click(closeButton);

      expect(localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "true");
    });

    it("should hide banner after clicking dismiss", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(screen.getByText("Get the Docter app")).toBeInTheDocument();

      const closeButton = screen.getByRole("button", {
        name: "Dismiss banner",
      });
      fireEvent.click(closeButton);

      expect(screen.queryByText("Get the Docter app")).not.toBeInTheDocument();
    });

    it("should check localStorage on mount", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  describe("Play Store Link", () => {
    it("should have correct Play Store URL", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", PLAY_STORE_URL);
    });

    it("should open in new tab", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("should have security attributes for external link", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on close button", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const closeButton = screen.getByRole("button", {
        name: "Dismiss banner",
      });
      expect(closeButton).toBeInTheDocument();
    });

    it("should have aria-hidden on decorative icons", () => {
      mockUseMediaQuery.mockReturnValue(true);

      const { container } = render(<MobileAppBanner />);

      const svgs = container.querySelectorAll("svg");
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute("aria-hidden", "true");
      });
    });

    it("should be keyboard navigable", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const link = screen.getByRole("link");
      const closeButton = screen.getByRole("button", {
        name: "Dismiss banner",
      });

      link.focus();
      expect(link).toHaveFocus();

      closeButton.focus();
      expect(closeButton).toHaveFocus();
    });

    it("should have proper heading structure in banner content", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      // Banner should have clear title and subtitle
      expect(screen.getByText("Get the Docter app")).toBeInTheDocument();
      expect(screen.getByText("Download on Google Play")).toBeInTheDocument();
    });
  });

  describe("Content", () => {
    it("should display app name", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(screen.getByText("Get the Docter app")).toBeInTheDocument();
    });

    it("should display download text", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      expect(screen.getByText("Download on Google Play")).toBeInTheDocument();
    });

    it("should render Play Store icon", () => {
      mockUseMediaQuery.mockReturnValue(true);

      const { container } = render(<MobileAppBanner />);

      // Check for SVG with Play Store path
      const playStoreIcon = container.querySelector('svg[viewBox="0 0 512 512"]');
      expect(playStoreIcon).toBeInTheDocument();
    });

    it("should render close icon", () => {
      mockUseMediaQuery.mockReturnValue(true);

      const { container } = render(<MobileAppBanner />);

      // Check for close icon SVG
      const closeIcon = container.querySelector('svg[viewBox="0 0 24 24"]');
      expect(closeIcon).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle rapid dismiss clicks", () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(<MobileAppBanner />);

      const closeButton = screen.getByRole("button", {
        name: "Dismiss banner",
      });

      // Click multiple times rapidly
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);

      // Banner should be hidden and not throw errors
      expect(screen.queryByText("Get the Docter app")).not.toBeInTheDocument();
    });
  });
});
