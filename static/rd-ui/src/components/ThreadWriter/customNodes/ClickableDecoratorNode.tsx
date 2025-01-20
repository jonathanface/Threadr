import { DecoratorNode, NodeKey } from "lexical";
import { JSX } from "react";
import { useAppNavigation } from "../../../hooks/useAppNavigation";
import { useCurrentSelections } from "../../../hooks/useCurrentSelections";
import { AssociationTooltip } from "../AssociationTooltip";

export class ClickableDecoratorNode extends DecoratorNode<JSX.Element> {
    private name: string;
    private id: string;
    private shortDescription: string;
    private classModifier?: string | undefined;
    private associationType: string;
    private portrait: string;

    static getType(): string {
        return "clickable-decorator";
    }

    static clone(node: ClickableDecoratorNode): ClickableDecoratorNode {
        return new ClickableDecoratorNode(node.name, node.id, node.shortDescription, node.associationType, node.portrait, node.classModifier, node.__key);
    }

    constructor(text: string, id: string, description: string, associationType: string, portrait: string, classModifier?: string, key?: NodeKey,) {
        super(key);
        this.name = text;
        this.id = id;
        this.shortDescription = description ? description : "";
        this.classModifier = classModifier ? classModifier : "";
        this.associationType = associationType;
        this.portrait = portrait ? portrait : "";
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
        return <ClickableDecorator name={this.name} id={this.id} shortDescription={this.shortDescription} associationType={this.associationType} portrait={this.portrait} classModifier={this.classModifier} />;
    }
}

const ClickableDecorator = ({ name, id, shortDescription, associationType, portrait, classModifier }: {
    name: string, id: string, shortDescription: string, associationType: string, portrait: string, classModifier: string | undefined
}) => {
    const { setIsAssociationPanelOpen } = useAppNavigation();
    const { setCurrentAssociationID } = useCurrentSelections();

    const handleLeftClick = () => {
        setCurrentAssociationID(id);
        setIsAssociationPanelOpen(true);
    }

    const handleRightClick = (event: React.MouseEvent) => {
        event.preventDefault();
        alert(`Right-clicked: ${name}, ${id}`);
    }

    const className = !classModifier ? "highlight " + associationType : "highlight " + associationType + "-" + classModifier;
    return (
        <span
            style={{ cursor: "pointer", textDecoration: "underline", color: "blue" }}
            onClick={handleLeftClick} onContextMenu={handleRightClick}
        >
            <AssociationTooltip
                name={name}
                description={shortDescription}
                portrait={portrait}>
                <span
                    onClick={() => {
                        handleLeftClick();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRightClick(e);
                    }}
                    className={className}>
                    {name}
                </span>
            </AssociationTooltip>

        </span>
    );
};
