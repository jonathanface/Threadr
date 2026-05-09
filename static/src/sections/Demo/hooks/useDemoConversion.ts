import axios from "axios";
import { usePostHog } from "@posthog/react";
import type {
  SerializedEditorState,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { api } from "../../../api";
import { useWorksList } from "../../../hooks/useWorksList";
import type { Story } from "../../../types/Story";
import { buildStoryFormData } from "../../CreateOrEditStory/utils/formDataBuilder";
import {
  DEMO_PENDING_CONVERSION_KEY,
  clearDraft,
  readDraft,
} from "../storage";
import type { DemoDraft } from "../types";

const DEFAULT_IMAGE_URL = "/img/writerdesk.jpg";

interface ConversionResult {
  story: Story;
  block_count: number;
  association_count: number;
}

const fetchDefaultImageFile = async (): Promise<File> => {
  const res = await fetch(DEFAULT_IMAGE_URL);
  if (!res.ok) {
    throw new Error(`Failed to load default story image (${res.status})`);
  }
  const blob = await res.blob();
  return new File([blob], "writerdesk.jpg", {
    type: blob.type || "image/jpeg",
  });
};

interface BlockWire {
  key_id: string;
  chunk: SerializedElementNode<SerializedLexicalNode>;
  place: string;
}

const draftToBlocks = (draft: DemoDraft): BlockWire[] => {
  let parsed: SerializedEditorState;
  try {
    parsed = JSON.parse(draft.lexical_state) as SerializedEditorState;
  } catch {
    return [];
  }
  const root = parsed.root;
  if (!root || !Array.isArray(root.children)) return [];

  return root.children.map((child, idx) => {
    const node = child as SerializedElementNode<SerializedLexicalNode> & {
      key_id?: string;
    };
    const keyId = node.key_id ?? uuidv4();
    const chunk: SerializedElementNode<SerializedLexicalNode> & {
      key_id?: string;
    } = { ...node, key_id: keyId };
    return {
      key_id: keyId,
      chunk,
      place: idx.toString(),
    };
  });
};

const draftToAssociations = (draft: DemoDraft) =>
  draft.associations.map((a) => ({
    association_id: a.client_id,
    association_name: a.name,
    association_type: a.type,
    short_description: a.short_description,
    portrait: "",
    aliases: "",
    case_sensitive: true,
    details: {
      aliases: "",
      case_sensitive: true,
      extended_description: a.extended_description,
    },
  }));

export const useDemoConversion = () => {
  const posthog = usePostHog();
  const { storiesList, setStoriesList } = useWorksList();

  const convert = useCallback(
    async (title: string): Promise<ConversionResult> => {
      const draft = readDraft();
      if (!draft) {
        throw new Error("No demo draft found");
      }

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new Error("Title is required");
      }

      const imageFile = await fetchDefaultImageFile();

      const formData = buildStoryFormData({
        title: trimmedTitle,
        description: "Imported from a Threadr trial draft.",
        image: imageFile,
      });

      const { data: story } = await api.post<Story>("/stories", formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });

      const chapter = story.chapters?.[0];
      if (!chapter?.id) {
        throw new Error("Story created but no chapter returned");
      }

      const associationPayload = draftToAssociations(draft);
      if (associationPayload.length > 0) {
        try {
          await api.post(
            `/stories/${story.story_id}/associations`,
            associationPayload,
            { withCredentials: true },
          );
        } catch (err) {
          // Non-fatal: log and continue. The story still exists; user can recreate associations.
          if (axios.isAxiosError(err)) {
            console.error(
              "Demo association seed failed:",
              err.response?.status,
              err.response?.data,
            );
          } else {
            console.error("Demo association seed failed:", err);
          }
        }
      }

      const blocks = draftToBlocks(draft);
      if (blocks.length > 0) {
        await api.put(
          `/stories/${story.story_id}`,
          {
            story_id: story.story_id,
            chapter_id: chapter.id,
            blocks,
          },
          {
            withCredentials: true,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      clearDraft();
      localStorage.removeItem(DEMO_PENDING_CONVERSION_KEY);

      // Update the cached worksList so the new story shows up in /stories
      // without a hard refresh. Demo conversions never assign a series, so we
      // only need to touch storiesList.
      if (storiesList) {
        setStoriesList([...storiesList, story]);
      } else {
        setStoriesList([story]);
      }

      posthog?.capture("demo_converted_to_signup", {
        story_id: story.story_id,
        block_count: blocks.length,
        association_count: associationPayload.length,
      });

      return {
        story,
        block_count: blocks.length,
        association_count: associationPayload.length,
      };
    },
    [posthog, storiesList, setStoriesList],
  );

  return { convert };
};
