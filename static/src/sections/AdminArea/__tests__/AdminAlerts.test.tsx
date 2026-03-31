import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { AdminArea } from "../index";
import { UserContext, UserContextType } from "../../../contexts/user";
import { LoaderContext } from "../../../contexts/loader";
import { MemoryRouter } from "react-router-dom";

// --- Mocks ---

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../../api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();

vi.mock("../../../hooks/useLoader", () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    loadingCount: 0,
  }),
}));

// --- Helpers ---

function renderAdminArea() {
  const userContextValue: UserContextType = {
    userDetails: {
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "User",
      subscriber: true,
      admin: true,
    },
    isLoggedIn: true,
    userLoading: false,
    setIsLoggedIn: vi.fn(),
    setUserDetails: vi.fn(),
    clearWelcomeFlags: vi.fn(),
  };

  const loaderContextValue = {
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    loadingCount: 0,
  };

  return render(
    <MemoryRouter>
      <LoaderContext.Provider value={loaderContextValue}>
        <UserContext.Provider value={userContextValue}>
          <AdminArea />
        </UserContext.Provider>
      </LoaderContext.Provider>
    </MemoryRouter>
  );
}

// --- Tests ---

describe("AdminArea - Alert Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty users list so the admin area renders
    mockGet.mockResolvedValue({ data: [] });
  });

  describe("Form rendering", () => {
    it("should render the alert creation form with subject, message, and type inputs", async () => {
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText("Alert subject...")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Enter alert message...")
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("/stories/some-id or https://...")
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Announcement/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Personal/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Send Alert" })
      ).toBeInTheDocument();
    });

    it("should have announcement selected by default", async () => {
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      const announcementRadio = screen.getByLabelText(
        /Announcement/
      ) as HTMLInputElement;
      expect(announcementRadio.checked).toBe(true);
    });

    it("should show email field when personal type is selected", async () => {
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      // Email field should not be visible initially
      expect(
        screen.queryByPlaceholderText("user@example.com")
      ).not.toBeInTheDocument();

      // Select personal
      await user.click(screen.getByLabelText(/Personal/));

      expect(
        screen.getByPlaceholderText("user@example.com")
      ).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("should show error for empty subject", async () => {
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      // Fill message but leave subject empty
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "Some message"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      expect(screen.getByText("Subject is required")).toBeInTheDocument();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("should show error for empty message", async () => {
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      // Fill subject but leave message empty
      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Test Subject"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      expect(screen.getByText("Message is required")).toBeInTheDocument();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("should show error for personal alert without email", async () => {
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Personal Alert"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "A message for you."
      );
      await user.click(screen.getByLabelText(/Personal/));
      // Leave email empty
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      expect(
        screen.getByText("Email is required for personal alerts")
      ).toBeInTheDocument();
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe("Submission", () => {
    it("should call API on valid announcement submit", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "New Feature"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "We just launched a new feature."
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/admin/alerts", {
          subject: "New Feature",
          message: "We just launched a new feature.",
          link: undefined,
          alert_type: "announcement",
          target_email: "",
        });
      });
    });

    it("should call API on valid personal alert submit", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Account Notice"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "Your subscription is expiring."
      );
      await user.click(screen.getByLabelText(/Personal/));
      await user.type(
        screen.getByPlaceholderText("user@example.com"),
        "user@test.com"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/admin/alerts", {
          subject: "Account Notice",
          message: "Your subscription is expiring.",
          link: undefined,
          alert_type: "personal",
          target_email: "user@test.com",
        });
      });
    });

    it("should include link when provided", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Check this out"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "A great new page."
      );
      await user.type(
        screen.getByPlaceholderText("/stories/some-id or https://..."),
        "/stories/cool-story"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/admin/alerts", {
          subject: "Check this out",
          message: "A great new page.",
          link: "/stories/cool-story",
          alert_type: "announcement",
          target_email: "",
        });
      });
    });

    it("should treat link field as optional (undefined when empty)", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "No link"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "Just a message."
      );
      // Do not fill the link field
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/admin/alerts",
          expect.objectContaining({
            link: undefined,
          })
        );
      });
    });
  });

  describe("Feedback messages", () => {
    it("should show success message after creation", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Test Alert"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "Message body"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(
          screen.getByText("Alert sent successfully")
        ).toBeInTheDocument();
      });
    });

    it("should clear form fields after successful creation", async () => {
      mockPost.mockResolvedValue({ data: { success: true } });
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      const subjectInput = screen.getByPlaceholderText("Alert subject...");
      const messageInput = screen.getByPlaceholderText(
        "Enter alert message..."
      );

      await user.type(subjectInput, "Test Alert");
      await user.type(messageInput, "Message body");
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(subjectInput).toHaveValue("");
        expect(messageInput).toHaveValue("");
      });
    });

    it("should show error on API failure", async () => {
      mockPost.mockRejectedValue(new Error("Server error"));
      const user = userEvent.setup();
      renderAdminArea();

      await waitFor(() => {
        expect(screen.getByText("Create Alert")).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText("Alert subject..."),
        "Failing Alert"
      );
      await user.type(
        screen.getByPlaceholderText("Enter alert message..."),
        "This will fail"
      );
      await user.click(screen.getByRole("button", { name: "Send Alert" }));

      await waitFor(() => {
        expect(screen.getByText("Failed to send alert")).toBeInTheDocument();
      });
    });
  });
});
