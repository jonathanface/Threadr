// hooks/useFetchStoryBlocks.ts
import { useCallback, useState } from 'react';
import { SerializedEditorState } from 'lexical';
import { useLoader } from './useLoader';
import { CustomSerializedParagraphNode, CustomParagraphNode } from '../components/ThreadWriter/customNodes/CustomParagraphNode';
import { v4 as uuidv4 } from 'uuid';
import { useToaster } from './useToaster';
import { AlertToastType } from '../types/AlertToasts';

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
    previousNodeKeysRef?: React.RefObject<Set<string>>
) => {
    const { showLoader, hideLoader } = useLoader();
    const { setAlertState } = useToaster();
    const [previousTableStatus, setPreviousTableStatus] = useState('ok');

    const getBatchedStoryBlocks = useCallback(async (startKey: string) => {
        if (!storyId || !chapterId || !previousNodeKeysRef || !setStoryBlocks) return;
        try {
            showLoader();
            const response = await fetch(`/api/stories/${storyId}/content?key=${startKey}&chapter=${chapterId}`);
            if (!response.ok) throw response;
            const data = await response.json();
            const remappedStoryBlocks = data.items?.map((item: { chunk: any; key_id: any }) => {
                const key = item.key_id?.Value || '';
                previousNodeKeysRef.current.add(key);
                const fixed: CustomSerializedParagraphNode = item.chunk?.Value
                    ? JSON.parse(item.chunk.Value)
                    : generateBlankLine();
                fixed.key_id = key;

                if (fixed.type !== CustomParagraphNode.getType()) {
                    fixed.type = CustomParagraphNode.getType();
                }
                return fixed;
            }) || [];

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
        } catch (error: unknown) {
            const response: Response = error as Response;
            // the table is still being created
            if (response.status === 501) {
                setAlertState({
                    title: "Chapter Being Created",
                    message:
                        "Your chapter is being created on our servers and will take a few minutes to complete. You can type, but nothing will be saved until the process is complete. You will be notified when everything's ready and your content saved.",
                    severity: AlertToastType.warning,
                    open: true,
                    timeout: null
                });
                setPreviousTableStatus('501');
            }
            // Either the doc is blank or the table is still being created
            if (response.status === 404 || response.status === 501) {
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
        } finally {
            hideLoader();
        }
    }, [chapterId, setStoryBlocks, storyId, previousNodeKeysRef]);

    return { getBatchedStoryBlocks, previousTableStatus, setPreviousTableStatus };
};
