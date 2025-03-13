import { AssociationTooltip } from "../../AssociationTooltip";
import { ClickData } from "../plugins/DocumentClickPlugin";

export const ClickableDecorator = ({ name, id, shortDescription, associationType, portrait, classModifier, format, leftClickCallback, rightClickCallback }: {
    name: string, id: string, shortDescription: string, associationType: string, portrait: string, classModifier?: string, format: string, leftClickCallback?: (value: ClickData) => void, rightClickCallback?: (value: ClickData) => void
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

    const baseClass = !classModifier ? `highlight ${associationType}` : `highlight ${associationType}-${classModifier}`;
    // If there's formatting info (like "bold italic"), append additional classes.
    const formatClass = format ? format : "";
    const combinedClass = `${baseClass} ${formatClass}`.trim();
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
                    className={combinedClass}>
                    {name}
                </span>
            </AssociationTooltip>

        </span>
    );
};
