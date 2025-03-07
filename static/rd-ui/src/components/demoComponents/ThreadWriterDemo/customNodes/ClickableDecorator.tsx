import { AssociationTooltip } from "../../../AssociationTooltip";
import { ClickData } from "../plugins/DocumentClickPlugin";

export const ClickableDecorator = ({ name, id, shortDescription, associationType, portrait, classModifier, leftClickCallback, rightClickCallback }: {
    name: string, id: string, shortDescription: string, associationType: string, portrait: string, classModifier: string | undefined, leftClickCallback?: (value: ClickData) => void, rightClickCallback?: (value: ClickData) => void
}) => {

    const handleLeftClick = (event: React.MouseEvent) => {
        if (leftClickCallback) {
            leftClickCallback({
                id,
                text: name,
                x: event.pageX,
                y: event.pageY
            });
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
            style={{ cursor: "pointer" }}
            onClick={handleLeftClick} onContextMenu={handleRightClick}
        >
            <AssociationTooltip
                name={name}
                description={shortDescription}
                portrait={portrait}>
                <span
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleLeftClick(e);
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
