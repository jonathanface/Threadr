import { APIError } from "../../types/API";
import { DBOperation, DBOperationBlock, DBOperationType, DocumentBlocksForServer } from "../../types/DBOperations";
import { BlockOrderMap } from "../../types/Document";
import { DeleteSuccessPayload, emitDeleteSuccess, emitSaveSuccess, emitSyncOrderSuccess, SaveSuccessPayload, SyncOrderSuccessPayload } from "../../utils/EventEmitter";

type OperationRecord = {
    op: DBOperationType;
    block: DBOperationBlock;
    time: number;
    storyID: string;
    chapterID: string;
    tableStatus?: string
};

const OpQueueByKey: Map<string, OperationRecord> = new Map();
const SyncOps: DBOperation[] = [];

export const QueueOp = (
    opType: DBOperationType,
    storyID: string,
    chapterID: string,
    block: DBOperationBlock,
    tableStatus?: string
) => {
    const existing = OpQueueByKey.get(block.key_id);

    if (existing) {
        if (existing.op === DBOperationType.delete && opType === DBOperationType.save) {
            // Save after delete is invalid — ignore
            return;
        }
        if (existing.op === DBOperationType.save && opType === DBOperationType.delete) {
            // Overwrite the save with a delete
            OpQueueByKey.set(block.key_id, {
                op: DBOperationType.delete,
                storyID,
                chapterID,
                tableStatus,
                block,
                time: Date.now(),
            });
            return;
        }
    }

    OpQueueByKey.set(block.key_id, {
        op: opType,
        block,
        storyID,
        chapterID,
        time: Date.now(),
        tableStatus,
    });
}

export const QueueSyncOrder = (op: DBOperation) => {
    SyncOps.push(op);
}

export const ProcessDBQueue = async () => {
    const saveOps: DBOperationBlock[] = [];
    const deleteOps: DBOperationBlock[] = [];

    const deleteKeys = new Set<string>();
    const records = [...OpQueueByKey.values()];

    let storyID: string = '';
    let chapterID: string = '';
    let tableStatus: string | undefined;

    // Pass 1: Identify deletes
    for (const record of records) {
        if (record.op === DBOperationType.delete) {
            deleteKeys.add(record.block.key_id);
        }
    }

    // Pass 2: Separate save/delete ops based on conflict rules
    for (const record of records) {
        if (!storyID) {
            storyID = record.storyID;
            chapterID = record.chapterID;
            tableStatus = record.tableStatus;
        }

        if (record.op === DBOperationType.save && !deleteKeys.has(record.block.key_id)) {
            saveOps.push(record.block);
        } else if (record.op === DBOperationType.delete) {
            deleteOps.push(record.block);
        }
    }

    OpQueueByKey.clear();

    // Send save ops
    if (saveOps.length) {
        try {
            await saveBlocksToServer(saveOps, storyID, chapterID, tableStatus);
        } catch (err) {
            console.error("Failed to save", err);
            saveOps.forEach((block) =>
                OpQueueByKey.set(block.key_id, {
                    op: DBOperationType.save,
                    storyID,
                    chapterID,
                    block,
                    time: Date.now(),
                    tableStatus
                })
            );
        }
    }

    // Send delete ops
    if (deleteOps.length) {
        try {
            await deleteBlocksFromServer(deleteOps, storyID, chapterID, tableStatus);
        } catch (err) {
            console.error("Failed to delete", err);
            deleteOps.forEach((block) =>
                OpQueueByKey.set(block.key_id, {
                    op: DBOperationType.delete,
                    storyID,
                    chapterID,
                    tableStatus,
                    block,
                    time: Date.now(),
                })
            );
        }
    }

    // Send sync order ops
    for (const op of SyncOps) {
        try {
            await syncBlockOrderMap(op.orderList!, op.storyID, op.chapterID, op.tableStatus);
        } catch (err) {
            console.error("Failed to sync order", err);
            SyncOps.push(op); // re-queue
        }
    }

    SyncOps.length = 0;
}


const saveBlocksToServer = async (ops: DBOperationBlock[], storyID: string, chapterID: string, tableStatus?: string) => {
    const params: DocumentBlocksForServer = {
        story_id: storyID,
        chapter_id: chapterID,
        blocks: ops,
    };
    const response = await fetch(`/api/stories/${storyID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
    });
    if (!response.ok && response.status !== 501) {
        const error: APIError = { statusCode: response.status, statusText: response.statusText, retry: true };
        throw error;
    }
    if (tableStatus && tableStatus === '501') {
        const payload: SaveSuccessPayload = { storyID, chapterID };
        emitSaveSuccess(payload);
    }
};

const deleteBlocksFromServer = async (ops: DBOperationBlock[], storyID: string, chapterID: string, tableStatus?: string) => {
    try {
        const params: DocumentBlocksForServer = {
            story_id: storyID,
            chapter_id: chapterID,
            blocks: ops,
        };
        const response = await fetch("/api/stories/" + storyID + "/block", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });

        if (!response.ok && response.status !== 501) {
            const error: APIError = {
                statusCode: response.status,
                statusText: response.statusText,
                retry: true,
            };
            throw error;
        }
        if (tableStatus && tableStatus === '501') {
            const payload: DeleteSuccessPayload = { storyID, chapterID };
            emitDeleteSuccess(payload);
        }
    } catch (error: unknown) {
        console.error("ERROR DELETING BLOCK:", error);
    }
};

const syncBlockOrderMap = async (blockList: BlockOrderMap, storyID: string, chapterID: string, tableStatus?: string) => {
    try {
        const params: BlockOrderMap = {
            chapter_id: chapterID,
            blocks: blockList.blocks,
        };
        const response = await fetch("/api/stories/" + storyID + "/orderMap", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });
        if (!response.ok && response.status !== 501) {
            const error: APIError = {
                statusCode: response.status,
                statusText: response.statusText,
                retry: true,
            };
            throw error;
        }
        if (tableStatus && tableStatus === '501') {
            console.log("signal success")
            const payload: SyncOrderSuccessPayload = { storyID, chapterID };
            emitSyncOrderSuccess(payload);
        }
    } catch (error: unknown) {
        console.error("ERROR ORDERING BLOCKS: ", error);
    }
};
