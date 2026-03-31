import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserAlert } from "../../../types/Alert";
import { NotificationsBell } from "../index";

// --- Mocks ---

const mockNavigate = vi.fn();
const mockMarkAsRead = vi.fn().mockResolvedValue(undefined);
const mockFetchAlerts = vi.fn().mockResolvedValue(undefined);

let mockAlerts: UserAlert[] = [];
let mockUnreadCount = 0;

vi.mock("../../../hooks/useNotifications", () => ({
  useNotifications: () => ({
    alerts: mockAlerts,
    unreadCount: mockUnreadCount,
    markAsRead: mockMarkAsRead,
    fetchAlerts: mockFetchAlerts,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// --- Fixtures ---

const now = Math.floor(Date.now() / 1000);

const unreadAlert: UserAlert = {
  alert_id: "alert-1",
  subject: "New Feature Available",
  message: "Check out the new editor improvements.",
  link: "/stories/new-feature",
  alert_type: "announcement",
  target_email: "",
  created_at: now - 120, // 2 minutes ago
  created_by: "admin@threadr.net",
  read: false,
};

const readAlert: UserAlert = {
  alert_id: "alert-2",
  subject: "Welcome to Threadr",
  message: "Thanks for joining! Get started by creating your first story.",
  alert_type: "personal",
  target_email: "user@example.com",
  created_at: now - 86400, // 1 day ago
  created_by: "admin@threadr.net",
  read: true,
  read_at: now - 3600,
};

const unreadAlertNoLink: UserAlert = {
  alert_id: "alert-3",
  subject: "System Maintenance",
  message: "Scheduled maintenance tonight at 10pm.",
  alert_type: "announcement",
  target_email: "",
  created_at: now - 600, // 10 minutes ago
  created_by: "admin@threadr.net",
  read: false,
};

// --- Tests ---

describe("NotificationsBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlerts = [];
    mockUnreadCount = 0;
  });

  describe("Rendering", () => {
    it("should render the bell icon", () => {
      render(<NotificationsBell />);

      const bellButton = screen.getByRole("button", { name: "notifications" });
      expect(bellButton).toBeInTheDocument();
    });

    it("should show badge with unread count when > 0", () => {
      mockUnreadCount = 3;
      render(<NotificationsBell />);

      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("should hide badge when unread count is 0", () => {
      mockUnreadCount = 0;
      render(<NotificationsBell />);

      // MUI Badge with 0 value should not render visible badge content
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });
  });

  describe("Dropdown toggle", () => {
    it("should open dropdown on click", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      // Dropdown should not be visible initially
      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();

      const bellButton = screen.getByRole("button", { name: "notifications" });
      await user.click(bellButton);

      expect(screen.getByText("Notifications")).toBeInTheDocument();
    });

    it("should close dropdown on close button click", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      // Open dropdown
      await user.click(screen.getByRole("button", { name: "notifications" }));
      expect(screen.getByText("Notifications")).toBeInTheDocument();

      // Close dropdown
      await user.click(
        screen.getByRole("button", { name: "close notifications" })
      );

      expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
    });

    it("should close dropdown when clicking outside", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      const { container } = render(
        <div>
          <div data-testid="outside">Outside area</div>
          <NotificationsBell />
        </div>
      );

      // Open dropdown
      await user.click(screen.getByRole("button", { name: "notifications" }));
      expect(screen.getByText("Notifications")).toBeInTheDocument();

      // Click outside
      await user.click(screen.getByTestId("outside"));

      await waitFor(() => {
        expect(screen.queryByText("Notifications")).not.toBeInTheDocument();
      });
    });
  });

  describe("Alert items", () => {
    it("should render alert items with subject and message", async () => {
      mockAlerts = [unreadAlert, readAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      expect(screen.getByText("New Feature Available")).toBeInTheDocument();
      expect(
        screen.getByText("Check out the new editor improvements.")
      ).toBeInTheDocument();

      expect(screen.getByText("Welcome to Threadr")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Thanks for joining! Get started by creating your first story."
        )
      ).toBeInTheDocument();
    });

    it("should show dismiss button for unread alerts", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      expect(
        screen.getByRole("button", { name: "Mark as read" })
      ).toBeInTheDocument();
    });

    it("should hide dismiss button for read alerts", async () => {
      mockAlerts = [readAlert];
      mockUnreadCount = 0;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      // The read alert should be visible but have no dismiss button
      expect(screen.getByText("Welcome to Threadr")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Mark as read" })
      ).not.toBeInTheDocument();
    });

    it("should call markAsRead when dismiss button is clicked", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));
      await user.click(
        screen.getByRole("button", { name: "Mark as read" })
      );

      expect(mockMarkAsRead).toHaveBeenCalledWith("alert-1");
    });

    it("should apply read styling class to read alerts", async () => {
      mockAlerts = [readAlert];
      mockUnreadCount = 0;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      // The read alert item should have the alertItemRead class
      const alertItem = screen.getByText("Welcome to Threadr").closest("div[class*='alertItem']");
      expect(alertItem?.className).toMatch(/alertItemRead/);
    });

    it("should not apply read styling class to unread alerts", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      const alertItem = screen.getByText("New Feature Available").closest("div[class*='alertItem']");
      expect(alertItem?.className).not.toMatch(/alertItemRead/);
    });
  });

  describe("Alert navigation", () => {
    it("should navigate and mark as read when clicking an unread alert with a link", async () => {
      mockAlerts = [unreadAlert];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));
      await user.click(screen.getByText("New Feature Available"));

      expect(mockMarkAsRead).toHaveBeenCalledWith("alert-1");
      expect(mockNavigate).toHaveBeenCalledWith("/stories/new-feature");
    });

    it("should navigate without calling markAsRead when clicking a read alert with a link", async () => {
      const readAlertWithLink: UserAlert = {
        ...readAlert,
        link: "/stories/welcome",
      };
      mockAlerts = [readAlertWithLink];
      mockUnreadCount = 0;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));
      await user.click(screen.getByText("Welcome to Threadr"));

      expect(mockMarkAsRead).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/stories/welcome");
    });

    it("should not navigate when clicking an alert without a link", async () => {
      mockAlerts = [unreadAlertNoLink];
      mockUnreadCount = 1;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));
      await user.click(screen.getByText("System Maintenance"));

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Empty state", () => {
    it('should show "No notifications" when there are no alerts', async () => {
      mockAlerts = [];
      mockUnreadCount = 0;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      expect(screen.getByText("No notifications")).toBeInTheDocument();
    });
  });

  describe("Sorting", () => {
    it("should display alerts sorted by created_at descending (newest first)", async () => {
      const olderAlert: UserAlert = {
        ...unreadAlert,
        alert_id: "alert-old",
        subject: "Older Alert",
        created_at: now - 7200, // 2 hours ago
      };
      const newerAlert: UserAlert = {
        ...unreadAlert,
        alert_id: "alert-new",
        subject: "Newer Alert",
        created_at: now - 60, // 1 minute ago
      };
      mockAlerts = [olderAlert, newerAlert]; // intentionally out of order
      mockUnreadCount = 2;
      const user = userEvent.setup();

      render(<NotificationsBell />);

      await user.click(screen.getByRole("button", { name: "notifications" }));

      const subjects = screen
        .getAllByText(/Alert$/)
        .map((el) => el.textContent);
      expect(subjects[0]).toBe("Newer Alert");
      expect(subjects[1]).toBe("Older Alert");
    });
  });
});
