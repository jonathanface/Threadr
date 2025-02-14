import { AssociationTooltip } from "../../AssociationTooltip";
import { ClickData } from "../plugins/DocumentClickPlugin";

export const ClickableDecorator = ({ name, id, shortDescription, associationType, portrait, classModifier, leftClickCallback, rightClickCallback }: {
    name: string, id: string, shortDescription: string, associationType: string, portrait: string, classModifier: string | undefined, leftClickCallback?: () => void, rightClickCallback?: (value: ClickData) => void
}) => {

    const handleLeftClick = () => {
        if (leftClickCallback) {
            leftClickCallback();
        }
    }

    const handleRightClick = (event: React.MouseEvent) => {
        event.preventDefault();
        if (rightClickCallback) {
            rightClickCallback({
                id,
                text: name,
                x: event.pageX,
                y: event.pageY,
            });
        }
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
