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
  emitDeleteError,
  emitDeleteSuccess,
  emitSaveError,
  emitSaveSuccess,
  emitSyncOrderError,
  emitSyncOrderSuccess,
  SaveSuccessPayload,
  SyncOrderSuccessPayload,
} from "../../utils/EventEmitter";
import { logger } from "../../utils/logger";

type OperationRecord = {
  op: DBOperationType;
  block: DBOperationBlock;
  time: number;
  storyID: string;
  chapterID: string;
  tableBecameReady: boolean;
  epoch: number;
};

const OpQueueByKey: Map<string, OperationRecord> = new Map();

type DBOperationWithMeta = DBOperation & {
  epoch?: number;
  tableBecameReady: boolean;
};
const SyncOps: Map<string, DBOperationWithMeta> = new Map();
// helper to avoid collisions across chapters/epochs
const qKey = (
  epoch: number,
  storyID: string,
  chapterID: string,
  keyId: string,
) => `${epoch}:${storyID}:${chapterID}:${keyId}`;
// helper for sync operation keys (without block key_id)
const syncKey = (epoch: number, storyID: string, chapterID: string) =>
  `${epoch}:${storyID}:${chapterID}`;

export const QueueOp = (
  opType: DBOperationType,
  storyID: string,
  chapterID: string,
  block: DBOperationBlock,
  tableBecameReady: boolean,
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
      logger.warn("Queue operation: save after delete ignored (invalid)", {
        blockKeyId: block.key_id,
        storyID,
        chapterID,
        epoch,
      });
      return;
    }
    if (
      existing.op === DBOperationType.save &&
      opType === DBOperationType.delete
    ) {
      // Overwrite the save with a delete
      logger.debug("Queue operation: delete overrides previous save", {
        blockKeyId: block.key_id,
        storyID,
        chapterID,
        epoch,
      });
      OpQueueByKey.set(key, {
        op: DBOperationType.delete,
        storyID,
        chapterID,
        tableBecameReady: false,
        block,
        time: Date.now(),
        epoch,
      });
      return;
    }
    logger.debug("Queue operation: updating existing operation", {
      blockKeyId: block.key_id,
      opType,
      existingOpType: existing.op,
      storyID,
      chapterID,
      epoch,
    });
  } else {
    logger.debug("Queue operation: new operation queued", {
      blockKeyId: block.key_id,
      opType,
      storyID,
      chapterID,
      epoch,
      queueSize: OpQueueByKey.size + 1,
    });
  }

  OpQueueByKey.set(key, {
    op: opType,
    block,
    storyID,
    chapterID,
    time: Date.now(),
    tableBecameReady,
    epoch,
  });
};

export const QueueSyncOrder = (op: DBOperationWithMeta) => {
  const epoch = op.epoch ?? 0;
  const key = syncKey(epoch, op.storyID, op.chapterID);
  const existing = SyncOps.get(key);

  logger.debug(
    existing ? "Queue sync order: replacing existing" : "Queue sync order: new",
    {
      storyID: op.storyID,
      chapterID: op.chapterID,
      blockCount: op.orderList?.blocks?.length || 0,
      epoch,
      syncQueueSize: SyncOps.size + (existing ? 0 : 1),
    }
  );

  SyncOps.set(key, { ...op, epoch });
};

export const ProcessDBQueue = async () => {
  const queueSize = OpQueueByKey.size;
  const syncQueueSize = SyncOps.size;

  if (queueSize === 0 && syncQueueSize === 0) {
    return;
  }

  logger.info("Processing DB queue", {
    operationQueueSize: queueSize,
    syncQueueSize,
  });

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
    const { storyID, chapterID, tableBecameReady } = recs[0];

    for (const r of recs) {
      if (r.op === DBOperationType.save && !deleteKeys.has(r.block.key_id)) {
        saveOps.push(r.block);
      } else if (r.op === DBOperationType.delete) {
        deleteOps.push(r.block);
      }
    }

    // SAVE
    if (saveOps.length) {
      logger.debug("Processing save operations", {
        storyID,
        chapterID,
        blockCount: saveOps.length,
        tableBecameReady,
      });
      try {
        await saveBlocksToServer(saveOps, storyID, chapterID, tableBecameReady);
        logger.info("Save operations successful", {
          storyID,
          chapterID,
          blockCount: saveOps.length,
        });
      } catch (err) {
        logger.error("Failed to save blocks - requeuing", {
          error: err,
          storyID,
          chapterID,
          blockCount: saveOps.length,
          epoch: recs[0].epoch,
        });
        emitSaveError({
          storyID,
          chapterID,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        // requeue with same epoch & grouping key
        for (const b of saveOps) {
          const rec: OperationRecord = {
            op: DBOperationType.save,
            block: b,
            storyID,
            chapterID,
            time: Date.now(),
            tableBecameReady,
            epoch: recs[0].epoch,
          };
          OpQueueByKey.set(qKey(rec.epoch, storyID, chapterID, b.key_id), rec);
        }
      }
    }

    // DELETE
    if (deleteOps.length) {
      logger.debug("Processing delete operations", {
        storyID,
        chapterID,
        blockCount: deleteOps.length,
        tableBecameReady,
      });
      try {
        await deleteBlocksFromServer(
          deleteOps,
          storyID,
          chapterID,
          tableBecameReady,
        );
        logger.info("Delete operations successful", {
          storyID,
          chapterID,
          blockCount: deleteOps.length,
        });
      } catch (err) {
        logger.error("Failed to delete blocks - requeuing", {
          error: err,
          storyID,
          chapterID,
          blockCount: deleteOps.length,
          epoch: recs[0].epoch,
        });
        emitDeleteError({
          storyID,
          chapterID,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        for (const b of deleteOps) {
          const rec: OperationRecord = {
            op: DBOperationType.delete,
            block: b,
            storyID,
            chapterID,
            time: Date.now(),
            tableBecameReady,
            epoch: recs[0].epoch,
          };
          OpQueueByKey.set(qKey(rec.epoch, storyID, chapterID, b.key_id), rec);
        }
      }
    }
  }

  // Process order-sync ops
  if (SyncOps.size > 0) {
    logger.debug("Processing order-sync operations", {
      syncOpsCount: SyncOps.size,
    });

    // Snapshot sync ops and clear the map
    const syncOps = [...SyncOps.values()];
    SyncOps.clear();

    for (const op of syncOps) {
      try {
        await syncBlockOrderMap(
          op.orderList!,
          op.storyID,
          op.chapterID,
          op.tableBecameReady,
        );
        logger.info("Order-sync operation successful", {
          storyID: op.storyID,
          chapterID: op.chapterID,
          blockCount: op.orderList?.blocks?.length || 0,
        });
      } catch (err) {
        logger.error("Failed to sync order - requeuing", {
          error: err,
          storyID: op.storyID,
          chapterID: op.chapterID,
        });
        emitSyncOrderError({
          storyID: op.storyID,
          chapterID: op.chapterID,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        // Requeue with same key
        const epoch = op.epoch ?? 0;
        const key = syncKey(epoch, op.storyID, op.chapterID);
        SyncOps.set(key, op);
      }
    }
  }

  logger.info("DB queue processing complete", {
    remainingQueueSize: OpQueueByKey.size,
    remainingSyncQueueSize: SyncOps.size,
  });
};

const saveBlocksToServer = async (
  ops: DBOperationBlock[],
  storyID: string,
  chapterID: string,
  tableBecameReady: boolean,
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
  if (tableBecameReady) {
    const payload: SaveSuccessPayload = { storyID, chapterID };
    emitSaveSuccess(payload);
  }
};

const deleteBlocksFromServer = async (
  ops: DBOperationBlock[],
  storyID: string,
  chapterID: string,
  tableBecameReady: boolean,
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

    if (tableBecameReady) {
      const payload: DeleteSuccessPayload = { storyID, chapterID };
      emitDeleteSuccess(payload);
    }
  } catch (error) {
    logger.error("Error deleting blocks from server", {
      error,
      storyID,
      chapterID,
      blockCount: ops.length,
    });
    throw error;
  }
};

const syncBlockOrderMap = async (
  blockList: BlockOrderMap,
  storyID: string,
  chapterID: string,
  tableBecameReady: boolean,
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

    if (tableBecameReady) {
      const payload: SyncOrderSuccessPayload = { storyID, chapterID };
      emitSyncOrderSuccess(payload);
    }
  } catch (error) {
    logger.error("Error syncing block order", {
      error,
      storyID,
      chapterID,
      blockCount: blockList.blocks.length,
    });
    throw error;
  }
};
