import { AssociationTooltip } from "../../AssociationTooltip";

export const ClickableDecorator = ({ name, id, shortDescription, associationType, portrait, classModifier, leftClickCallback }: {
    name: string, id: string, shortDescription: string, associationType: string, portrait: string, classModifier: string | undefined, leftClickCallback?: () => void
}) => {
    //const { setIsAssociationPanelOpen } = useAppNavigation();
    //const { setCurrentAssociationID } = useSelections();

    const handleLeftClick = () => {
        if (leftClickCallback) {
            leftClickCallback();
        }
        //setCurrentAssociationID(id);
        //setIsAssociationPanelOpen(true);
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
