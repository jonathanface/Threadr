import { DecoratorNode, NodeKey } from "lexical";
import { JSX } from "react";

export class ClickableDecoratorNode extends DecoratorNode<JSX.Element> {
    private text: string;
    private id: string;

    static getType(): string {
        return "clickable-decorator";
    }

    static clone(node: ClickableDecoratorNode): ClickableDecoratorNode {
        return new ClickableDecoratorNode(node.text, node.id, node.__key,);
    }

    constructor(text: string, id: string, key?: NodeKey,) {
        super(key);
        this.text = text;
        this.id = id;
    }

    static importJSON(serializedNode: { text: string; type: string; version: number }): ClickableDecoratorNode {
        const { text } = serializedNode;
        return new ClickableDecoratorNode(text, "");
    }

    exportJSON(): { type: string; version: number; text: string, id: string } {
        return {
            type: "clickable-decorator",
            version: 1,
            text: this.text,
            id: this.id
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
        if (prevNode.text !== this.text) {
            dom.textContent = this.text;
            return true;
        }
        return false;
    }

    decorate(): JSX.Element {
        return <ClickableDecorator text={this.text} id={this.id} />;
    }
}

const ClickableDecorator = ({ text, id }: { text: string, id: string }) => {

    const handleLeftClick = () => alert(`Left-clicked: ${text}, ${id}`);

    const handleRightClick = (event: React.MouseEvent) => {
        event.preventDefault();
        alert(`Right-clicked: ${text}, ${id}`);
    }

    return (
        <span
            style={{ cursor: "pointer", textDecoration: "underline", color: "blue" }}
            onClick={handleLeftClick} onContextMenu={handleRightClick}
        >
            {text}
        </span>
    );
};
