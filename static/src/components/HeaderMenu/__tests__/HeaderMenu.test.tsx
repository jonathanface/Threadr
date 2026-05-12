import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../api";
import { AlertToastType } from "../../../types/AlertToasts";
import type { Series } from "../../../types/Series";
import type { Story } from "../../../types/Story";
import { HeaderMenu } from "../index";

// Mock dependencies
const mockSetStory = vi.fn();
const mockSetSeries = vi.fn();
const mockPropagateStoryUpdates = vi.fn();
const mockPropagateSeriesUpdates = vi.fn();
const mockSetAlertState = vi.fn();
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();

const mockStory: Story = {
  story_id: "story-123",
  title: "Test Story",
  description: "A test story",
  image_url: "https://example.com/story.jpg",
  chapters: [],
  inactive: false,
};

const mockSeries: Series = {
  series_id: "series-123",
  series_title: "Test Series",
  series_description: "A test series",
  image_url: "https://example.com/series.jpg",
  stories: [],
};

vi.mock("../../../hooks/useSelections", () => ({
  useSelections: () => ({
    story: mockStory,
    series: mockSeries,
    setStory: mockSetStory,
    setSeries: mockSetSeries,
    propagateStoryUpdates: mockPropagateStoryUpdates,
    propagateSeriesUpdates: mockPropagateSeriesUpdates,
  }),
}));

vi.mock("../../../hooks/useToaster", () => ({
  useToaster: () => ({
    setAlertState: mockSetAlertState,
  }),
}));

vi.mock("../../../hooks/useLoader", () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
  }),
}));

vi.mock("../../../hooks/useFetchUserData", () => ({
  useFetchUserData: () => ({
    isLoggedIn: true,
  }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/stories" }),
}));

vi.mock("../ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">Theme Toggle</div>,
}));

vi.mock("../../UserMenu", () => ({
  UserMenu: () => <div data-testid="user-menu">User Menu</div>,
}));

vi.mock("../../NotificationsBell", () => ({
  NotificationsBell: () => (
    <div data-testid="notifications-bell">Notifications</div>
  ),
}));

vi.mock("../../../api", () => ({
  api: {
    put: vi.fn(),
  },
}));

describe("HeaderMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render the Threadr logo", () => {
      render(<HeaderMenu />);

      const logo = screen.getByAltText("Threadr logo");
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute("src", "/img/threadr-logo-contrast.png");
    });

    it("should render logo link to home", () => {
      render(<HeaderMenu />);

      const logoLink = screen.getByRole("link");
      const baseUrl = `${window.location.protocol}//${window.location.host}`;
      expect(logoLink).toHaveAttribute("href", baseUrl);
    });

    it("should render story image", () => {
      render(<HeaderMenu />);

      const storyImage = screen.getByAltText("Test Story");
      expect(storyImage).toBeInTheDocument();
      expect(storyImage).toHaveAttribute("src", mockStory.image_url);
    });

    it("should render story title", () => {
      render(<HeaderMenu />);

      expect(screen.getByText("Test Story")).toBeInTheDocument();
    });

    it("should render series title", () => {
      render(<HeaderMenu />);

      expect(screen.getByText("Test Series")).toBeInTheDocument();
    });

    it("should render ThemeToggle component", () => {
      render(<HeaderMenu />);

      // ThemeToggle renders a button with aria-label
      expect(screen.getByLabelText("toggle theme")).toBeInTheDocument();
    });

    it("should render UserMenu component", () => {
      render(<HeaderMenu />);

      expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    });

    it("should render both story and series titles", () => {
      render(<HeaderMenu />);

      expect(screen.getByText("Test Story")).toBeInTheDocument();
      expect(screen.getByText("Test Series")).toBeInTheDocument();
    });
  });

  describe("Story Title Editing", () => {
    it("should update story title on edit", async () => {
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockResolvedValue({
        status: 200,
        data: {},
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "Updated Story Title");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(api.api.put).toHaveBeenCalledWith(
          "/stories/story-123/details",
          expect.any(FormData),
          expect.objectContaining({
            headers: { "Content-Type": "multipart/form-data" },
          }),
        );
        expect(mockSetStory).toHaveBeenCalled();
        expect(mockPropagateStoryUpdates).toHaveBeenCalled();
      });
    });

    it("should not update if new title is same as current", async () => {
      const user = userEvent.setup();

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "Test Story");

      // Trigger blur to save
      await user.tab();

      expect(api.api.put).not.toHaveBeenCalled();
      expect(mockSetStory).not.toHaveBeenCalled();
    });

    it("should not update if new title is empty or whitespace", async () => {
      const user = userEvent.setup();

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "   ");

      // Trigger blur to save
      await user.tab();

      expect(api.api.put).not.toHaveBeenCalled();
      expect(mockSetStory).not.toHaveBeenCalled();
    });

    it("should show error toast on update failure", async () => {
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockRejectedValue(new Error("Network error"));

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "Updated Story");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith({
          title: "Error",
          message: "Network error",
          severity: AlertToastType.error,
          open: true,
        });
      });
    });

    it("should show axios error message on update failure", async () => {
      const user = userEvent.setup();
      const axiosError = {
        isAxiosError: true,
        response: {
          data: { message: "Invalid story title" },
        },
      };
      vi.mocked(api.api.put).mockRejectedValue(axiosError);

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "Bad Title");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Invalid story title",
            severity: AlertToastType.error,
          }),
        );
      });
    });
  });

  describe("Series Title Editing", () => {
    it("should update series title on edit", async () => {
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockResolvedValue({
        status: 200,
        data: {},
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, "Updated Series Title");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(api.api.put).toHaveBeenCalledWith(
          "/series/series-123",
          expect.any(FormData),
          expect.objectContaining({
            headers: { "Content-Type": "multipart/form-data" },
          }),
        );
        expect(mockSetSeries).toHaveBeenCalled();
        expect(mockPropagateSeriesUpdates).toHaveBeenCalled();
      });
    });

    it("should not update if new series title is same as current", async () => {
      const user = userEvent.setup();

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, "Test Series");

      // Trigger blur to save
      await user.tab();

      expect(api.api.put).not.toHaveBeenCalled();
      expect(mockSetSeries).not.toHaveBeenCalled();
    });

    it("should not update if new series title is empty or whitespace", async () => {
      const user = userEvent.setup();

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, "   ");

      // Trigger blur to save
      await user.tab();

      expect(api.api.put).not.toHaveBeenCalled();
      expect(mockSetSeries).not.toHaveBeenCalled();
    });

    it("should show error toast on series update failure", async () => {
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockRejectedValue(new Error("Network error"));

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, "Updated Series");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith({
          title: "Error",
          message: "Network error",
          severity: AlertToastType.error,
          open: true,
        });
      });
    });

    it("should show axios error message on series update failure", async () => {
      const user = userEvent.setup();
      const axiosError = {
        isAxiosError: true,
        response: {
          data: { message: "Invalid series title" },
        },
      };
      vi.mocked(api.api.put).mockRejectedValue(axiosError);

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, "Bad Title");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Invalid series title",
            severity: AlertToastType.error,
          }),
        );
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle story with image_url", () => {
      render(<HeaderMenu />);

      const storyImage = screen.getByAltText("Test Story");
      expect(storyImage).toBeInTheDocument();
      expect(storyImage).toHaveAttribute("src", mockStory.image_url);
    });

    it("should handle very long story title", async () => {
      const longTitle = "A".repeat(50); // Reduced to avoid slow tests
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockResolvedValue({
        status: 200,
        data: {},
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, longTitle);

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(api.api.put).toHaveBeenCalled();
      });
    });

    it("should handle very long series title", async () => {
      const longTitle = "A".repeat(50); // Reduced to avoid slow tests
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockResolvedValue({
        status: 200,
        data: {},
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<HeaderMenu />);

      const seriesTitle = screen.getByText("Test Series");
      await user.dblClick(seriesTitle);

      const seriesInput = await screen.findByDisplayValue("Test Series");
      await user.clear(seriesInput);
      await user.type(seriesInput, longTitle);

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(api.api.put).toHaveBeenCalled();
      });
    });

    it("should handle error without message property", async () => {
      const user = userEvent.setup();
      vi.mocked(api.api.put).mockRejectedValue({});

      render(<HeaderMenu />);

      const storyTitle = screen.getByText("Test Story");
      await user.dblClick(storyTitle);

      const storyInput = await screen.findByDisplayValue("Test Story");
      await user.clear(storyInput);
      await user.type(storyInput, "Updated");

      // Trigger blur to save
      await user.tab();

      await waitFor(() => {
        expect(mockSetAlertState).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              "There was an error updating your story title. Please report this.",
          }),
        );
      });
    });
  });

  describe("Accessibility", () => {
    it("should have meaningful alt text for logo", () => {
      render(<HeaderMenu />);

      const logo = screen.getByAltText("Threadr logo");
      expect(logo).toBeInTheDocument();
    });

    it("should have alt text for logo", () => {
      render(<HeaderMenu />);

      const logo = screen.getByAltText("Threadr logo");
      expect(logo).toBeInTheDocument();
    });

    it("should have alt text for story image", () => {
      render(<HeaderMenu />);

      const storyImage = screen.getByAltText("Test Story");
      expect(storyImage).toBeInTheDocument();
    });
  });
});
