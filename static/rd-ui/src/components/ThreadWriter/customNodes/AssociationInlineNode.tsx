// AssociationInlineNode.ts
import { IS_BOLD, IS_ITALIC, IS_STRIKETHROUGH, IS_UNDERLINE, LexicalNode, TextNode } from "lexical";
import styles from './associationinlinenode.module.css';
import { ClickData } from "../plugins/DocumentClickPlugin";

let tooltipElement: null | HTMLDivElement = null;
let tooltipRemovalTimer: ReturnType<typeof setTimeout> | null = null;

const formatMap: { [key: number]: string } = {
    [IS_ITALIC]: 'italic',
    [IS_BOLD]: 'bold',
    [IS_STRIKETHROUGH]: 'strikethrough',
    [IS_UNDERLINE]: 'underline'
};

export class AssociationInlineNode extends TextNode {
    __associationId: string;
    __shortDescription: string;
    __associationType: string;
    __portrait: string;
    __leftClickCallback: ((value: ClickData) => void) | undefined;
    __rightClickCallback: ((value: ClickData) => void) | undefined;
    __handleLeftClick: (event: MouseEvent) => void;
    __handleRightClick: (event: MouseEvent) => void;
    __decorator: HTMLSpanElement | null = null;

    static getType() {
        return 'association-inline';
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

    getFormat() {
        return this.__format;
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
            node.getFormat()
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
        style?: string
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
            if (leftClickCallback) {
                leftClickCallback({
                    id: this.__associationId,
                    text: this.__text,
                    x: event.pageX,
                    y: event.pageY
                });
            }
        }

        this.__handleRightClick = (event: MouseEvent) => {
            event.preventDefault();
            if (rightClickCallback) {
                rightClickCallback({
                    id: this.__associationId,
                    text: this.__text,
                    x: event.pageX,
                    y: event.pageY,
                });
            }
        }
    }

    canMergeWith(): boolean {
        return false;
    }

    mergeWith(): LexicalNode {
        return this;
    }

    showTooltipLoader = () => {

    }

    showTooltip = (event: MouseEvent) => {
        if (tooltipElement !== null) return;
        if (tooltipRemovalTimer) {
            clearTimeout(tooltipRemovalTimer);
            tooltipRemovalTimer = null;
        }
        if (tooltipElement !== null) return; // Already showing
        document.querySelectorAll('#association-tooltip').forEach(el => el.remove());
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'association-tooltip';
        const tooltip = tooltipElement;
        tooltip.classList.add(styles.associationTooltipBody);
        const row = document.createElement('div');
        row.classList.add(styles.row);
        const column1 = document.createElement('span');
        column1.classList.add(styles.column);
        const img = document.createElement('img');
        img.alt = this.__shortDescription || "Click on the association to add a description.";
        img.addEventListener('load', () => {
            document.body.appendChild(tooltip);
            const height = tooltip.getBoundingClientRect().height;
            const topValue = event.clientY - height - 20;
            tooltip.style.top = topValue.toString() + "px";
            const width = tooltip.getBoundingClientRect().width;
            const leftValue = event.clientX - width / 2;
            tooltip.style.left = leftValue.toString() + "px";

        });
        img.src = this.__portrait || "/img/default_association_portrait.jpg";
        column1.append(img);
        row.append(column1);
        const column2 = document.createElement('span');
        column2.classList.add(styles.column);
        column2.textContent = this.__shortDescription || "Click on the association to add a description.";
        row.append(column2);
        tooltip.append(row);
        void window.getComputedStyle(tooltip).opacity;
        tooltip.classList.add(styles.show);

    }

    // hideTooltip = () => {
    //     if (tooltipElement) {
    //         tooltipElement.classList.remove(styles.show);
    //         setTimeout(() => {
    //             if (tooltipElement && tooltipElement.parentNode) {
    //                 tooltipElement.parentNode.removeChild(tooltipElement);
    //             }
    //             tooltipElement = null;
    //             document.querySelectorAll('#association-tooltip').forEach(el => el.remove());
    //         }, 200);
    //     }
    // }

    // reactivate() {
    //     if (!this.__decorator) return;
    //     this.__decorator.classList.add(styles.associationInline);
    //     this.__decorator.classList.add(styles[this.__associationType]);
    //     if (this.__format !== 0) {
    //         this.__decorator.classList.add(styles[formatMap[this.__format]]);
    //     }
    //     if (this.__rightClickCallback) {
    //         this.__decorator.addEventListener("contextmenu", this.__handleRightClick.bind(this));
    //     }
    //     if (this.__leftClickCallback) {
    //         this.__decorator.addEventListener("click", this.__handleLeftClick.bind(this));
    //     }
    //     this.__decorator.addEventListener('mouseenter', this.showTooltip);
    //     this.__decorator.addEventListener('mouseleave', this.hideTooltip);

    //     this.__decorator.style.pointerEvents = "auto";
    //     this.__decorator.removeAttribute("tabindex");
    // }

    // deactivate() {
    //     console.log("deactivate", this.__decorator);
    //     if (!this.__decorator) return;
    //     this.__decorator.classList.remove(styles.associationInline);
    //     this.__decorator.classList.remove(styles[this.__associationType]);
    //     //decoratorElement.removeAttribute("data-association-id");
    //     if (this.__rightClickCallback) {
    //         this.__decorator.removeEventListener("contextmenu", this.__handleRightClick.bind(this));
    //     }
    //     if (this.__leftClickCallback) {
    //         this.__decorator.removeEventListener("click", this.__handleLeftClick.bind(this));
    //     }
    //     this.__decorator.removeEventListener('mouseenter', this.showTooltip);
    //     this.__decorator.removeEventListener('mouseleave', this.hideTooltip);

    //     this.__decorator.style.pointerEvents = "none";
    //     this.__decorator.setAttribute("tabindex", "-1");
    // }

    // Override createDOM to add your custom classes and data attributes.
    createDOM(): HTMLElement {
        this.__decorator = document.createElement('span');
        this.__decorator.classList.add(styles.associationInline);
        this.__decorator.classList.add(styles[this.__associationType]);
        if (this.__format !== 0) {
            this.__decorator.classList.add(styles[formatMap[this.__format]]);
        }
        // You can store your association id in a data attribute if needed.
        this.__decorator.setAttribute("data-association-id", this.__associationId);
        this.__decorator.textContent = this.getTextContent();

        if (this.__rightClickCallback) {
            this.__decorator.addEventListener("contextmenu", this.__handleRightClick.bind(this));
        }
        if (this.__leftClickCallback) {
            this.__decorator.addEventListener("click", this.__handleLeftClick.bind(this));
        }

        this.__decorator.addEventListener('mouseenter', (event: MouseEvent) => {
            this.showTooltip(event)
        });
        this.__decorator.addEventListener('mouseleave', () => {
            if (tooltipElement) {
                tooltipElement.remove();
                tooltipElement = null;
            }
        });

        return this.__decorator;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateDOM(prevNode: AssociationInlineNode, dom: HTMLElement, config: any): boolean {
        this.__decorator = dom;
        //this.reactivate();
        return super.updateDOM(prevNode as this, dom, config);
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
            serializedNode.format
        );
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
    format?: number
): AssociationInlineNode {
    return new AssociationInlineNode(text, associationId, shortDescription, associationType, portrait, leftClickCallback, rightClickCallback, format);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function $isAssociationInlineNode(node: any): node is AssociationInlineNode {
    return node instanceof AssociationInlineNode;
}
