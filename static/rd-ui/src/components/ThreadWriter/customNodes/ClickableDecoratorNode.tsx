import { DecoratorNode, NodeKey } from "lexical";
import { JSX } from "react";
import { ClickableDecorator } from "./ClickableDecorator";

export class ClickableDecoratorNode extends DecoratorNode<JSX.Element> {
    private name: string;
    private id: string;
    private shortDescription: string;
    private classModifier?: string | undefined;
    private associationType: string;
    private portrait: string;
    private customLeftClick?: () => void;
    private customRightClick?: (value: string) => void;

    static getType(): string {
        return "clickable-decorator";
    }

    static clone(node: ClickableDecoratorNode): ClickableDecoratorNode {
        return new ClickableDecoratorNode(node.name, node.id, node.shortDescription, node.associationType, node.portrait, node.classModifier, node.customLeftClick, node.customRightClick, node.__key);
    }

    constructor(text: string, id: string, description: string, associationType: string, portrait: string, classModifier?: string, customLeftClick?: () => void, customRightClick?: (value: string) => void, key?: NodeKey,) {
        super(key);
        this.name = text;
        this.id = id;
        this.shortDescription = description ? description : "";
        this.classModifier = classModifier ? classModifier : "";
        this.associationType = associationType;
        this.portrait = portrait ? portrait : "";
        this.customLeftClick = customLeftClick;
        this.customRightClick = customRightClick;
    }

    static importJSON(serializedNode: {
        text: string;
        id: string;
        description: string;
        associationType: string;
        portrait: string;
        classModifier?: string;
        type: string;
        version: number;
    }): ClickableDecoratorNode {
        const { text, id, description, associationType, portrait, classModifier } = serializedNode;
        return new ClickableDecoratorNode(
            text,
            id,
            description,
            associationType,
            portrait,
            classModifier
        );
    }

    exportJSON(): {
        type: string;
        version: number;
        text: string;
        id: string;
        description: string;
        associationType: string;
        portrait: string;
        classModifier?: string;
    } {
        return {
            type: "clickable-decorator",
            version: 1,
            text: this.name,
            id: this.id,
            description: this.shortDescription,
            associationType: this.associationType,
            portrait: this.portrait,
            classModifier: this.classModifier,
        };
    }

    createDOM(): HTMLElement {
        const element = document.createElement("span");
        element.style.cursor = "pointer";
        element.style.textDecoration = "underline";
        element.style.color = "blue";
        return element;
    }

    updateDOM(prevNode: ClickableDecoratorNode, dom: HTMLElement): boolean {
        if (prevNode.name !== this.name) {
            dom.textContent = this.name;
            return true;
        }
        return false;
    }

    decorate(): JSX.Element {
        return <ClickableDecorator
            name={this.name}
            id={this.id}
            shortDescription={this.shortDescription}
            associationType={this.associationType}
            portrait={this.portrait}
            classModifier={this.classModifier}
            leftClickCallback={this.customLeftClick}
            rightClickCallback={this.customRightClick}
        />
    }

    getTextContent(): string {
        return this.name;
    }
}
