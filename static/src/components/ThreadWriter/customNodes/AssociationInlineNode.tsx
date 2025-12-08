// AssociationInlineNode.ts
import { EditorConfig, TextNode } from "lexical";
import styles from "./associationinlinenode.module.css";
import { ClickData } from "../plugins/DocumentClickPlugin";

let tooltipElement: null | HTMLDivElement = null;

export class AssociationInlineNode extends TextNode {
  __associationId: string;
  __shortDescription: string;
  __associationType: string;
  __portrait: string;
  __leftClickCallback: ((value: ClickData) => void) | undefined;
  __rightClickCallback: ((value: ClickData) => void) | undefined;
  __handleLeftClick: (event: MouseEvent) => void;
  __handleRightClick: (event: MouseEvent) => void;
  __handleTouchStart: (event: TouchEvent) => void;
  __handleTouchEnd: (event: TouchEvent) => void;
  __handleTouchMove: () => void;
  __decorator: HTMLSpanElement | null = null;
  __longPressTimer: NodeJS.Timeout | null = null;

  static getType() {
    return "association-inline";
  }

  getAssociationId() {
    return this.__associationId;
  }

  getName() {
    return this.__text;
  }

  getShortDescription() {
    return this.__shortDescription;
  }

  getPortrait() {
    return this.__portrait;
  }

  static clone<T extends AssociationInlineNode>(node: T): T {
    const cloned = new AssociationInlineNode(
      node.getTextContent(),
      node.__associationId,
      node.__shortDescription,
      node.__associationType,
      node.__portrait,
      node.__leftClickCallback,
      node.__rightClickCallback,
      node.getFormat(),
    ) as T;
    // Ensure the cloned node has the same key as the original
    cloned.__key = node.__key;
    return cloned;
  }

  constructor(
    text: string,
    associationId: string,
    shortDescription: string,
    associationType: string,
    portrait: string,
    leftClickCallback?: (value: ClickData) => void,
    rightClickCallback?: (value: ClickData) => void,
    format?: number,
    style?: string,
  ) {
    super();
    this.__text = text;
    this.__associationId = associationId;
    this.__shortDescription = shortDescription;
    this.__associationType = associationType;
    this.__portrait = portrait;
    if (leftClickCallback) {
      this.__leftClickCallback = leftClickCallback;
    }
    if (rightClickCallback) {
      this.__rightClickCallback = rightClickCallback;
    }
    if (format) {
      this.__format = format;
    }
    if (style) {
      this.__style = style;
    }

    this.__handleLeftClick = (event: MouseEvent) => {
      this.hideHovers();
      if (leftClickCallback) {
        leftClickCallback({
          id: this.__associationId,
          text: this.__text,
          x: event.pageX,
          y: event.pageY,
        });
      }
    };

    this.__handleRightClick = (event: MouseEvent) => {
      event.preventDefault();
      this.hideHovers();
      if (rightClickCallback) {
        rightClickCallback({
          id: this.__associationId,
          text: this.__text,
          x: event.pageX,
          y: event.pageY,
        });
      }
    };

    this.__handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      // Start a timer for long press (500ms)
      this.__longPressTimer = setTimeout(() => {
        event.preventDefault();
        this.hideHovers();
        if (rightClickCallback) {
          rightClickCallback({
            id: this.__associationId,
            text: this.__text,
            x: touch.pageX,
            y: touch.pageY,
          });
        }
        this.__longPressTimer = null;
      }, 500);
    };

    this.__handleTouchEnd = () => {
      // If timer is still active, it was a short tap - treat as left click
      if (this.__longPressTimer) {
        clearTimeout(this.__longPressTimer);
        this.__longPressTimer = null;
      }
    };

    this.__handleTouchMove = () => {
      // Cancel long press if finger moves
      if (this.__longPressTimer) {
        clearTimeout(this.__longPressTimer);
        this.__longPressTimer = null;
      }
    };
  }

  isUnmergeable(): boolean {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  showTooltipLoader = () => {};

  hideHovers() {
    document
      .querySelectorAll("#association-tooltip")
      .forEach((el) => el.remove());
    if (tooltipElement) {
      tooltipElement.remove();
      tooltipElement = null; // Make sure to set it to null
    }
  }

  showTooltip = (event: MouseEvent) => {
    if (tooltipElement !== null) return; // Prevent multiple tooltips

    this.hideHovers();

    // Create and append the tooltip immediately
    tooltipElement = document.createElement("div");
    tooltipElement.id = "association-tooltip";
    const tooltip = tooltipElement;
    tooltip.classList.add(styles.associationTooltipBody);

    const row = document.createElement("div");
    row.classList.add(styles.row);

    const column1 = document.createElement("span");
    column1.classList.add(styles.column);

    // Create the img element, but don't wait for it to load to show the tooltip
    const img = document.createElement("img");

    column1.appendChild(img);
    row.appendChild(column1);

    // Create column2 with the description text
    const column2 = document.createElement("span");
    column2.classList.add(styles.column);
    column2.textContent =
      this.__shortDescription ||
      "Click on the association to add a description.";
    row.appendChild(column2);

    tooltip.appendChild(row);

    // Append the tooltip to the body, without waiting for the image
    document.body.appendChild(tooltip);

    // Initially position the tooltip (will be adjusted after image loads)
    const height = tooltip.getBoundingClientRect().height;
    const topValue = event.clientY - height - 20;
    tooltip.style.top = topValue.toString() + "px";
    const width = tooltip.getBoundingClientRect().width;
    const leftValue = event.clientX - width / 2;
    tooltip.style.left = leftValue.toString() + "px";

    // Now wait for the image to load
    img.onload = () => {
      // After the image is loaded, update the tooltip positioning if necessary
      const updatedHeight = tooltip.getBoundingClientRect().height;
      const updatedTopValue = event.clientY - updatedHeight - 20;
      tooltip.style.top = updatedTopValue.toString() + "px"; // Recalculate and adjust the top position
    };
    img.alt = this.__text || "Unknown Name";
    img.src = this.__portrait || "/img/default_association_portrait.jpg";
    img.classList.add(styles.tooltipImage); // Optional: add a class for styling the image

    // Show the tooltip immediately without waiting for the image to load
    tooltip.classList.add(styles.show);
  };

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config) as HTMLElement; // <-- lets TextNode wire format classes
    dom.classList.add(styles.associationInline, styles[this.__associationType]);
    dom.setAttribute("data-association-id", this.__associationId);
    if (this.__rightClickCallback) {
      dom.addEventListener("contextmenu", this.__handleRightClick.bind(this));
    }
    if (this.__leftClickCallback) {
      dom.addEventListener("click", this.__handleLeftClick.bind(this));
    }

    // Add touch event listeners for mobile long-press support
    dom.addEventListener("touchstart", this.__handleTouchStart.bind(this), { passive: true });
    dom.addEventListener("touchend", this.__handleTouchEnd.bind(this));
    dom.addEventListener("touchmove", this.__handleTouchMove.bind(this));

    dom.addEventListener("mouseenter", (event: MouseEvent) => {
      console.log("enter", this.__text);
      this.showTooltip(event);
    });
    dom.addEventListener("mouseleave", () => {
      if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
      }
    });
    return dom;
  }

  updateDOM(
    prevNode: AssociationInlineNode,
    dom: HTMLElement,
    config: unknown,
  ): boolean {
    this.__decorator = dom;
    return super.updateDOM(prevNode as this, dom, config as EditorConfig);
  }

  // Serialize the node to JSON.
  exportJSON() {
    return {
      ...super.exportJSON(),
      associationId: this.__associationId,
      shortDescription: this.__shortDescription,
      associationType: this.__associationType,
      portrait: this.__portrait,
      type: "association-inline",
      version: 1,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static importJSON(serializedNode: any): AssociationInlineNode {
    return $createAssociationInlineNode(
      serializedNode.text,
      serializedNode.associationId,
      serializedNode.shortDescription,
      serializedNode.associationType,
      serializedNode.portrait,
      serializedNode.leftClickCallback,
      serializedNode.rightClickCallback,
      serializedNode.format,
    );
  }

  isTextEntity(): true {
    return true;
  }
  isInline(): boolean {
    return true;
  }
}

// Helper functions for node creation and type checking.
export function $createAssociationInlineNode(
  text: string,
  associationId: string,
  shortDescription: string,
  associationType: string,
  portrait: string,
  leftClickCallback?: (value: ClickData) => void,
  rightClickCallback?: (value: ClickData) => void,
  format?: number,
): AssociationInlineNode {
  return new AssociationInlineNode(
    text,
    associationId,
    shortDescription,
    associationType,
    portrait,
    leftClickCallback,
    rightClickCallback,
    format,
  );
}

export function $isAssociationInlineNode(
  node: unknown,
): node is AssociationInlineNode {
  return node instanceof AssociationInlineNode;
}
