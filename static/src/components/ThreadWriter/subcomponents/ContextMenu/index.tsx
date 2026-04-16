import { useCallback, useEffect, useRef, useState } from "react";
import { MenuItem } from "./MenuItem";
import styles from "./custom-context.module.css";
import { MenuItemEntry } from "../../../../types/MenuItemEntry";

export interface ContextMenuProps {
  name: string;
  visible: boolean;
  y: number;
  x: number;
  items: MenuItemEntry[];
  onDismiss?: () => void;
}

export const ContextMenu = (props: ContextMenuProps) => {
  const { visible, x, y, items, onDismiss } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Reset focused index when menu closes
  useEffect(() => {
    if (!visible) {
      setFocusedIndex(-1); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [visible]);

  // Clamp position so the menu stays within its offset parent
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const menu = menuRef.current;
    const parent = menu.offsetParent as HTMLElement | null;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let adjustedX = x;
    let adjustedY = y;

    if (adjustedX + menuRect.width > parentRect.width) {
      adjustedX = parentRect.width - menuRect.width;
    }
    if (adjustedY + menuRect.height > parentRect.height) {
      adjustedY = parentRect.height - menuRect.height;
    }

    menu.style.left = `${Math.max(0, adjustedX)}px`;
    menu.style.top = `${Math.max(0, adjustedY)}px`;
  }, [visible, x, y]);

  // Dismiss on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss?.();
      }
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!visible) return;
    // Delay so the right-click that opened the menu doesn't immediately close it
    const id = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [visible, handleOutsideClick]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onDismiss?.();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < items.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev > 0 ? prev - 1 : items.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (focusedIndex >= 0 && items[focusedIndex]?.command) {
            items[focusedIndex].command!(
              e as unknown as React.MouseEvent<HTMLButtonElement>,
            );
          }
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onDismiss, items, focusedIndex]);

  const style = visible
    ? { display: "block", top: `${y}px`, left: `${x}px` }
    : { display: "none" as const, top: "0px", left: "0px" };

  return (
    <div ref={menuRef} className={styles.customContext} style={style}>
      <ul className={styles.menu} role="menu">
        {items.map((item, index) => (
          <MenuItem
            key={index}
            item={item}
            focused={index === focusedIndex}
          />
        ))}
      </ul>
    </div>
  );
};
