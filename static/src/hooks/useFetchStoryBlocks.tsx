// hooks/useFetchStoryBlocks.ts
import { useCallback, useState } from "react";
import { SerializedEditorState } from "lexical";
import { useLoader } from "./useLoader";
import {
  CustomSerializedParagraphNode,
  CustomParagraphNode,
} from "../components/ThreadWriter/customNodes/CustomParagraphNode";
import { v4 as uuidv4 } from "uuid";
import { useToaster } from "./useToaster";
import { AlertToastType } from "../types/AlertToasts";
import axios from "axios";
import { api } from "../api";

const generateBlankLine = (): CustomSerializedParagraphNode => ({
  children: [],
  direction: "ltr",
  format: "",
  indent: 0,
  textFormat: 0,
  textStyle: "",
  type: CustomParagraphNode.getType(),
  version: 1,
  key_id: uuidv4(),
});

export const useFetchStoryBlocks = (
  storyId: string,
  chapterId: string,
  setStoryBlocks?: (blocks: SerializedEditorState) => void,
  previousNodeKeysRef?: React.RefObject<Map<string, string>>,
) => {
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [previousTableStatus, setPreviousTableStatus] = useState("ok");

  const getBatchedStoryBlocks = useCallback(
    async (startKey: string) => {
      if (!storyId || !chapterId || !previousNodeKeysRef || !setStoryBlocks)
        return;

      try {
        showLoader();

        const { data } = await api.get<{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items?: Array<{ chunk: any; key_id: any }>;
        }>(`/stories/${storyId}/content`, {
          params: {
            key: startKey,
            chapter: chapterId,
          },
          validateStatus: (status) => {
            // let 2xx, 404, and 501 resolve so we can handle them in catch logic
            return (
              (status >= 200 && status < 300) ||
              status === 404 ||
              status === 501
            );
          },
        });

        previousNodeKeysRef.current = new Map();

        const remappedStoryBlocks: CustomSerializedParagraphNode[] =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.items?.map((item: any) => {
            const key = item.key_id?.Value || "";

            const fixed: CustomSerializedParagraphNode = item.chunk?.Value
              ? JSON.parse(item.chunk.Value)
              : generateBlankLine();
            fixed.key_id = key;

            const children = fixed.children || [];
            const textContent = children
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((child: any) => child.text)
              .join("");
            previousNodeKeysRef.current.set(key, textContent);

            if (fixed.type !== CustomParagraphNode.getType()) {
              fixed.type = CustomParagraphNode.getType();
            }
            return fixed;
          }) ?? [];

        setStoryBlocks({
          root: {
            children: remappedStoryBlocks,
            type: "root",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
          },
        });
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          if (status === 501) {
            setAlertState({
              title: "Chapter Being Created",
              message:
                "Your chapter is being created on our servers and will take a few minutes to complete. You can type, but nothing will be saved until the process is complete. You will be notified when everything's ready and your content saved.",
              severity: AlertToastType.warning,
              open: true,
              timeout: null,
            });
            setPreviousTableStatus("501");
          }

          if (status === 404 || status === 501) {
            setStoryBlocks({
              root: {
                children: [generateBlankLine()],
                type: "root",
                version: 1,
                direction: "ltr",
                format: "",
                indent: 0,
              },
            });
          } else {
            console.error("Error retrieving story content:", error);
          }
        } else {
          console.error("Unexpected error retrieving story content:", error);
        }
      } finally {
        hideLoader();
      }
    },
    [
      chapterId,
      setStoryBlocks,
      storyId,
      previousNodeKeysRef,
      showLoader,
      hideLoader,
      setAlertState,
    ],
  );

  return { getBatchedStoryBlocks, previousTableStatus, setPreviousTableStatus };
};
