import { api } from "../../api";
import { APIError } from "../../types/API";
import {
  DBOperation,
  DBOperationBlock,
  DBOperationType,
  DocumentBlocksForServer,
} from "../../types/DBOperations";
import { BlockOrderMap } from "../../types/Document";
import {
  DeleteSuccessPayload,
  emitDeleteSuccess,
  emitSaveSuccess,
  emitSyncOrderSuccess,
  SaveSuccessPayload,
  SyncOrderSuccessPayload,
} from "../../utils/EventEmitter";

type OperationRecord = {
  op: DBOperationType;
  block: DBOperationBlock;
  time: number;
  storyID: string;
  chapterID: string;
  tableStatus?: string;
  epoch: number;
};

const OpQueueByKey: Map<string, OperationRecord> = new Map();

type DBOperationWithMeta = DBOperation & { epoch?: number };
const SyncOps: Array<DBOperationWithMeta> = [];
// helper to avoid collisions across chapters/epochs
const qKey = (
  epoch: number,
  storyID: string,
  chapterID: string,
  keyId: string,
) => `${epoch}:${storyID}:${chapterID}:${keyId}`;

export const QueueOp = (
  opType: DBOperationType,
  storyID: string,
  chapterID: string,
  block: DBOperationBlock,
  tableStatus?: string,
  meta?: { epoch?: number },
) => {
  const epoch = meta?.epoch ?? 0;
  const key = qKey(epoch, storyID, chapterID, block.key_id);
  const existing = OpQueueByKey.get(key);

  if (existing) {
    if (
      existing.op === DBOperationType.delete &&
      opType === DBOperationType.save
    ) {
      // Save after delete is invalid — ignore
      return;
    }
    if (
      existing.op === DBOperationType.save &&
      opType === DBOperationType.delete
    ) {
      // Overwrite the save with a delete
      OpQueueByKey.set(block.key_id, {
        op: DBOperationType.delete,
        storyID,
        chapterID,
        tableStatus,
        block,
        time: Date.now(),
        epoch,
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
    epoch,
  });
};

export const QueueSyncOrder = (op: DBOperationWithMeta) => {
  SyncOps.push(op); // op should include .epoch
};

export const ProcessDBQueue = async () => {
  // snapshot and clear immediately to avoid concurrent mutation during processing
  const records = [...OpQueueByKey.values()];
  OpQueueByKey.clear();

  // Group by epoch/story/chapter
  type GroupKey = string;
  const groupKey = (r: OperationRecord): GroupKey =>
    `${r.epoch}:${r.storyID}:${r.chapterID}`;
  const groups = new Map<GroupKey, OperationRecord[]>();
  for (const r of records) {
    const k = groupKey(r);
    const arr = groups.get(k);
    if (arr) {
      arr.push(r);
    } else {
      groups.set(k, [r]);
    }
  }

  // Process each group independently
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_, recs] of groups) {
    const deleteKeys = new Set<string>();
    for (const r of recs)
      if (r.op === DBOperationType.delete) deleteKeys.add(r.block.key_id);

    const saveOps: DBOperationBlock[] = [];
    const deleteOps: DBOperationBlock[] = [];

    // all recs in group share these three fields
    const { storyID, chapterID, tableStatus } = recs[0];

    for (const r of recs) {
      if (r.op === DBOperationType.save && !deleteKeys.has(r.block.key_id)) {
        saveOps.push(r.block);
      } else if (r.op === DBOperationType.delete) {
        deleteOps.push(r.block);
      }
    }

    // SAVE
    if (saveOps.length) {
      try {
        await saveBlocksToServer(saveOps, storyID, chapterID, tableStatus);
      } catch (err) {
        console.error("Failed to save", err);
        // requeue with same epoch & grouping key
        for (const b of saveOps) {
          const rec: OperationRecord = {
            op: DBOperationType.save,
            block: b,
            storyID,
            chapterID,
            time: Date.now(),
            tableStatus,
            epoch: recs[0].epoch,
          };
          OpQueueByKey.set(qKey(rec.epoch, storyID, chapterID, b.key_id), rec);
        }
      }
    }

    // DELETE
    if (deleteOps.length) {
      try {
        await deleteBlocksFromServer(
          deleteOps,
          storyID,
          chapterID,
          tableStatus,
        );
      } catch (err) {
        console.error("Failed to delete", err);
        for (const b of deleteOps) {
          const rec: OperationRecord = {
            op: DBOperationType.delete,
            block: b,
            storyID,
            chapterID,
            time: Date.now(),
            tableStatus,
            epoch: recs[0].epoch,
          };
          OpQueueByKey.set(qKey(rec.epoch, storyID, chapterID, b.key_id), rec);
        }
      }
    }
  }

  // Process order-sync ops in a safe loop
  let n = SyncOps.length;
  while (n--) {
    const op = SyncOps.shift()!; // oldest first
    try {
      await syncBlockOrderMap(
        op.orderList!,
        op.storyID,
        op.chapterID,
        op.tableStatus,
      );
    } catch (err) {
      console.error("Failed to sync order", err);
      SyncOps.push(op); // requeue
    }
  }
};

const saveBlocksToServer = async (
  ops: DBOperationBlock[],
  storyID: string,
  chapterID: string,
  tableStatus?: string,
) => {
  const params: DocumentBlocksForServer = {
    story_id: storyID,
    chapter_id: chapterID,
    blocks: ops,
  };
  const res = await api.put(`/stories/${storyID}`, params, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (status) => {
      return (status >= 200 && status < 300) || status === 501;
    },
  });

  if (res.status !== 200 && res.status !== 201 && res.status !== 501) {
    const error: APIError = {
      statusCode: res.status,
      statusText: res.statusText,
      retry: true,
    };
    throw error;
  }
  if (tableStatus && tableStatus === "501") {
    const payload: SaveSuccessPayload = { storyID, chapterID };
    emitSaveSuccess(payload);
  }
};

const deleteBlocksFromServer = async (
  ops: DBOperationBlock[],
  storyID: string,
  chapterID: string,
  tableStatus?: string,
) => {
  try {
    const params: DocumentBlocksForServer = {
      story_id: storyID,
      chapter_id: chapterID,
      blocks: ops,
    };

    const res = await api.delete(`/stories/${storyID}/block`, {
      headers: { "Content-Type": "application/json" },
      data: params,
      validateStatus: (status) => {
        return (status >= 200 && status < 300) || status === 501;
      },
    });

    if (res.status !== 200 && res.status !== 204 && res.status !== 501) {
      const error: APIError = {
        statusCode: res.status,
        statusText: res.statusText,
        retry: true,
      };
      throw error;
    }

    if (tableStatus && tableStatus === "501") {
      const payload: DeleteSuccessPayload = { storyID, chapterID };
      emitDeleteSuccess(payload);
    }
  } catch (error) {
    console.error("ERROR DELETING BLOCK:", error);
  }
};

const syncBlockOrderMap = async (
  blockList: BlockOrderMap,
  storyID: string,
  chapterID: string,
  tableStatus?: string,
) => {
  try {
    const params: BlockOrderMap = {
      chapter_id: chapterID,
      blocks: blockList.blocks,
    };

    const res = await api.put(`/stories/${storyID}/orderMap`, params, {
      headers: { "Content-Type": "application/json" },
      validateStatus: (status) => {
        return (status >= 200 && status < 300) || status === 501;
      },
    });

    if (res.status !== 200 && res.status !== 201 && res.status !== 501) {
      const error: APIError = {
        statusCode: res.status,
        statusText: res.statusText,
        retry: true,
      };
      throw error;
    }

    if (tableStatus && tableStatus === "501") {
      console.log("signal success");
      const payload: SyncOrderSuccessPayload = { storyID, chapterID };
      emitSyncOrderSuccess(payload);
    }
  } catch (error) {
    console.error("ERROR ORDERING BLOCKS:", error);
  }
};
