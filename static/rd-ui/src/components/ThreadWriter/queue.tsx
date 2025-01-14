import { APIError } from "../../types/API";
import { DBOperation, DBOperationBlock, DBOperationType, DocumentBlocksForServer } from "../../types/DBOperations";
import { BlockOrderMap } from "../../types/Document";

export const DbOperationQueue: DBOperation[] = [];

let dbQueueRetryCount = 0;
const isAPIError = (error: any): boolean => {
    return "statusCode" in error && "statusText" in error && "retry" in error;
};

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

const saveBlocksToServer = (ops: DBOperationBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
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
            if (!response.ok) {
                const error: APIError = { statusCode: response.status, statusText: response.statusText, retry: true };
                reject(error);
                return;
            }
            resolve(response.json());
        } catch (e) {
            console.error("ERROR SAVING BLOCK:", e);
            reject(e);
        }
    });
};

const deleteBlocksFromServer = (ops: DBOperationBlock[], storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
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

            if (!response.ok) {
                const error: APIError = {
                    statusCode: response.status,
                    statusText: response.statusText,
                    retry: true,
                };
                reject(error);
                return;
            }
            resolve(response.json());
        } catch (e) {
            console.error("ERROR DELETING BLOCK: " + e);
            reject(e);
        }
    });
};

const syncBlockOrderMap = (blockList: BlockOrderMap, storyID: string, chapterID: string) => {
    return new Promise(async (resolve, reject) => {
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
            if (!response.ok) {
                const error: APIError = {
                    statusCode: response.status,
                    statusText: response.statusText,
                    retry: true,
                };
                reject(error);
                return;
            }
            resolve(response.json());
        } catch (e) {
            console.error("ERROR ORDERING BLOCKS: " + e);
            reject(e);
        }
    });
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
                    await saveBlocksToServer(minifiedBlocks, op.storyID, op.chapterID);
                    dbQueueRetryCount = 0;
                } catch (error: any) {
                    if (isAPIError(error)) {
                        if (error.retry) {
                            console.error("server response " + error.statusCode + ", retrying...");
                            const retryOp: DBOperation = {
                                type: DBOperationType.save,
                                blocks: minifiedBlocks,
                                storyID: op.storyID,
                                chapterID: op.chapterID,
                                time: new Date().getTime(),
                            };
                            dbQueueRetryCount++;
                            retryArray.push(retryOp);
                        }
                    }
                }
                break;
            }
            case DBOperationType.delete: {
                const minifiedBlocks = filterAndReduceDBOperations(DbOperationQueue, op.type, i);
                try {
                    await deleteBlocksFromServer(minifiedBlocks, op.storyID, op.chapterID);
                    dbQueueRetryCount = 0;
                } catch (error: any) {
                    if (isAPIError(error)) {
                        if (error.retry) {
                            console.error("server response " + error.statusCode + ", retrying...");
                            const retryOp: DBOperation = {
                                type: DBOperationType.delete,
                                blocks: minifiedBlocks,
                                storyID: op.storyID,
                                chapterID: op.chapterID,
                                time: new Date().getTime(),
                            };
                            retryArray.push(retryOp);
                            dbQueueRetryCount++;
                        }
                    }
                }
                break;
            }
            case DBOperationType.syncOrder: {
                try {
                    if (op.orderList) {
                        await syncBlockOrderMap(op.orderList, op.storyID, op.chapterID);
                        DbOperationQueue.splice(i, 1);
                        dbQueueRetryCount = 0;
                    }
                } catch (error: any) {
                    if (error as APIError) {
                        if (error.retry) {
                            console.error("server response " + error.statusCode + ", retrying...");
                            retryArray.push(DbOperationQueue[i]);
                            dbQueueRetryCount++;
                        }
                        DbOperationQueue.splice(i, 1);
                    }
                }
                break;
            }
        }
    }
};