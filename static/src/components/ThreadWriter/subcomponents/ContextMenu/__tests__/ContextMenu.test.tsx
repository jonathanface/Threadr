import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, ContextMenuProps } from "../index";
import { MenuItemEntry } from "../../../../../types/MenuItemEntry";

describe("ContextMenu", () => {
  let onDismiss: ReturnType<typeof vi.fn>;
  let items: MenuItemEntry[];
  let commandSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onDismiss = vi.fn();
    commandSpy = vi.fn();
    items = [
      { name: "Copy", command: commandSpy },
      { name: "Paste", command: vi.fn() },
      {
        name: "Make Association",
        subItems: [{ name: "Character", command: vi.fn() }],
      },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderMenu = (overrides: Partial<ContextMenuProps> = {}) =>
    render(
      <ContextMenu
        name=""
        visible={true}
        x={100}
        y={200}
        items={items}
        onDismiss={onDismiss}
        {...overrides}
      />,
    );

  describe("visibility", () => {
    it("should display when visible is true", () => {
      const { container } = renderMenu();
      const menu = container.firstChild as HTMLElement;
      expect(menu.style.display).toBe("block");
    });

    it("should hide when visible is false", () => {
      const { container } = renderMenu({ visible: false });
      const menu = container.firstChild as HTMLElement;
      expect(menu.style.display).toBe("none");
    });

    it("should render all menu items", () => {
      renderMenu();
      expect(screen.getByText("Copy")).toBeDefined();
      expect(screen.getByText("Paste")).toBeDefined();
      expect(screen.getByText("Make Association")).toBeDefined();
    });
  });

  describe("positioning", () => {
    it("should set initial position from props", () => {
      const { container } = renderMenu({ x: 50, y: 75 });
      const menu = container.firstChild as HTMLElement;
      expect(menu.style.top).toBe("75px");
      expect(menu.style.left).toBe("50px");
    });
  });

  describe("dismiss on outside click", () => {
    it("should call onDismiss when clicking outside the menu", () => {
      renderMenu();
      // Flush the setTimeout(0) that registers the listener
      act(() => {
        vi.advanceTimersByTime(1);
      });

      fireEvent.mouseDown(document.body);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("should not call onDismiss when clicking inside the menu", () => {
      renderMenu();
      act(() => {
        vi.advanceTimersByTime(1);
      });

      fireEvent.mouseDown(screen.getByText("Copy"));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("should not register outside-click listener when hidden", () => {
      renderMenu({ visible: false });
      act(() => {
        vi.advanceTimersByTime(1);
      });

      fireEvent.mouseDown(document.body);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("keyboard navigation", () => {
    it("should dismiss on Escape", () => {
      renderMenu();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("should not respond to keyboard when hidden", () => {
      renderMenu({ visible: false });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("should focus first item on ArrowDown", () => {
      renderMenu();
      fireEvent.keyDown(document, { key: "ArrowDown" });

      const buttons = screen.getAllByRole("menuitem");
      // The first item's button should receive focus
      expect(buttons[0].querySelector("button")).toBe(document.activeElement);
    });

    it("should wrap focus to first item from last on ArrowDown", () => {
      renderMenu();
      // Press ArrowDown 3 times to reach last item, then once more to wrap
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });
      fireEvent.keyDown(document, { key: "ArrowDown" });

      const buttons = screen.getAllByRole("menuitem");
      expect(buttons[0].querySelector("button")).toBe(document.activeElement);
    });

    it("should wrap focus to last top-level item from first on ArrowUp", () => {
      renderMenu();
      fireEvent.keyDown(document, { key: "ArrowUp" });

      // Should focus the last top-level item ("Make Association"), not the sub-item
      expect(screen.getByText("Make Association").closest("button")).toBe(
        document.activeElement,
      );
    });

    it("should execute command on Enter when item is focused", () => {
      renderMenu();
      // Focus the first item
      fireEvent.keyDown(document, { key: "ArrowDown" });
      // Activate it
      fireEvent.keyDown(document, { key: "Enter" });

      expect(commandSpy).toHaveBeenCalledTimes(1);
    });

    it("should not execute command on Enter without focused item", () => {
      renderMenu();
      // Press Enter without first focusing an item
      fireEvent.keyDown(document, { key: "Enter" });

      expect(commandSpy).not.toHaveBeenCalled();
    });
  });

  describe("ARIA roles", () => {
    it("should have role=menu on lists", () => {
      renderMenu();
      const menus = screen.getAllByRole("menu");
      // Top-level menu + submenu for "Make Association"
      expect(menus.length).toBe(2);
      expect(menus[0].tagName).toBe("UL");
    });

    it("should have role=menuitem on each item including sub-items", () => {
      renderMenu();
      const menuItems = screen.getAllByRole("menuitem");
      // 3 top-level items + 1 sub-item ("Character")
      expect(menuItems.length).toBe(4);
    });
  });

  describe("MenuItem", () => {
    it("should render buttons instead of anchor tags", () => {
      renderMenu();
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);

      // No anchor tags should exist
      const anchors = document.querySelectorAll("a");
      expect(anchors.length).toBe(0);
    });

    it("should execute command on click", () => {
      renderMenu();
      fireEvent.click(screen.getByText("Copy"));
      expect(commandSpy).toHaveBeenCalledTimes(1);
    });

    it("should render submenu items", () => {
      renderMenu();
      expect(screen.getByText("Character")).toBeDefined();
    });
  });
});
