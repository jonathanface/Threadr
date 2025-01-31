// DraggableTreeItem.tsx
import React from 'react';
import { DraggableProvided, DraggableStateSnapshot, Draggable } from '@hello-pangea/dnd';
import { TreeItem, TreeItemProps } from '@mui/x-tree-view';

interface DraggableTreeItemProps extends TreeItemProps {
    draggableId: string;
    index: number;
}

export const DraggableTreeItem: React.FC<DraggableTreeItemProps> = ({
    draggableId,
    index,
    children,
    ...treeItemProps
}) => {
    return (
        <Draggable draggableId={draggableId} index={index}>
            {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={{
                        ...provided.draggableProps.style,
                        // Optional: Add some styling based on the drag state
                        background: snapshot.isDragging ? '#f0f0f0' : 'inherit',
                    }}
                >
                    <TreeItem {...treeItemProps}>{children}</TreeItem>
                </div>
            )}
        </Draggable>
    );
};
