import { APIError } from "../../types/API";
import { DBOperation, DBOperationBlock, DBOperationType, DocumentBlocksForServer } from "../../types/DBOperations";
import { BlockOrderMap } from "../../types/Document";
import { DeleteSuccessPayload, emitDeleteSuccess, emitSaveSuccess, emitSyncOrderSuccess, SaveSuccessPayload, SyncOrderSuccessPayload } from "../../utils/EventEmitter";

export const DbOperationQueue: DBOperation[] = [];

let dbQueueRetryCount = 0;

interface OpsHolder {
    [key: string]: DBOperationBlock[];
}

const filterAndReduceDBOperations = (
    dbOperations: DBOperation[],
    opType: DBOperationType,
    startIndex: number
) => {
    const keyIDMap: OpsHolder = {};
    let j = startIndex;
    while (j < dbOperations.length) {
        const obj = dbOperations[j];
        if (obj.type === opType) {
            obj.blocks.forEach((block) => {
                keyIDMap[block.key_id] = keyIDMap[block.key_id] === undefined ? [] : keyIDMap[block.key_id];
                keyIDMap[block.key_id].push(block);
            });
            dbOperations.splice(j, 1);
        } else {
            j++;
        }
    }
    const toRun: DBOperationBlock[] = [];
    Object.keys(keyIDMap).forEach((keyID) => {
        const lastElement = keyIDMap[keyID].pop();
        if (lastElement) {
            toRun.push(lastElement);
        }
        delete keyIDMap[keyID];
    });
    return toRun;
};

const saveBlocksToServer = async (ops: DBOperationBlock[], storyID: string, chapterID: string, tableStatus?: string) => {
    try {
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

    } catch (error: unknown) {
        console.error("ERROR SAVING BLOCK:", error);
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

export const ProcessDBQueue = async () => {
    console.log(`executing DB queue, processing ${DbOperationQueue.length} items`);
    DbOperationQueue.sort((a, b) => a.time - b.time);
    const retryArray: DBOperation[] = [];
    const i = 0;
    while (i < DbOperationQueue.length) {
        const op = DbOperationQueue[i];
        switch (op.type) {
            case DBOperationType.save: {
                const minifiedBlocks = filterAndReduceDBOperations(DbOperationQueue, op.type, i);
                console.log(`minimized queue to ${minifiedBlocks.length} items`)
                try {
                    await saveBlocksToServer(minifiedBlocks, op.storyID, op.chapterID, op.tableStatus);
                    dbQueueRetryCount = 0;
                } catch (error: unknown) {
                    const apiError = error as APIError;
                    if (apiError.retry) {
                        console.error("server response " + apiError.statusCode + ", retrying...");
                        retryArray.push(DbOperationQueue[i]);
                        dbQueueRetryCount++;
                    }
                }
                break;
            }
            case DBOperationType.delete: {
                const minifiedBlocks = filterAndReduceDBOperations(DbOperationQueue, op.type, i);
                try {
                    await deleteBlocksFromServer(minifiedBlocks, op.storyID, op.chapterID, op.tableStatus);
                    dbQueueRetryCount = 0;
                } catch (error: unknown) {
                    const apiError = error as APIError;
                    if (apiError.retry) {
                        console.error("server response " + apiError.statusCode + ", retrying...");
                        retryArray.push(DbOperationQueue[i]);
                        dbQueueRetryCount++;
                    }
                }
                break;
            }
            case DBOperationType.syncOrder: {
                try {
                    if (op.orderList) {
                        await syncBlockOrderMap(op.orderList, op.storyID, op.chapterID, op.tableStatus);
                        DbOperationQueue.splice(i, 1);
                        dbQueueRetryCount = 0;
                    }
                } catch (error: unknown) {
                    const apiError = error as APIError;
                    if (apiError.retry) {
                        console.error("server response " + apiError.statusCode + ", retrying...");
                        retryArray.push(DbOperationQueue[i]);
                        dbQueueRetryCount++;
                    }
                    DbOperationQueue.splice(i, 1);
                }
            }
                break;
        }
        if (dbQueueRetryCount === 10) {
            const errorText = `Error contacting server, timing out after ${dbQueueRetryCount} tries...`;
            throw new Error(errorText)
        } else {
            DbOperationQueue.push(...retryArray);
        }
    }
}