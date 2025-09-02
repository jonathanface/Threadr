import { SimpleTreeView } from "@mui/x-tree-view";
import { useSelections } from "../../hooks/useSelections";
import { ClickData } from "../ThreadWriter/plugins/DocumentClickPlugin";
import { Typography } from "@mui/material";
import { OutlineStageCard } from "./OutlineStageCard";
import { Outline, OutlineSection, OutlineTemplate } from "../../types/Outline";
import { Story } from "../../types/Story";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";

interface OutlineMenuProps {
  onAssociationClick: (data: ClickData) => void;
}

export const OutlineMenu = ({ onAssociationClick }: OutlineMenuProps) => {
  const { story, setStory, propagateStoryUpdates } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  if (!story) {
    return null;
  }
  const defaultOutline: Outline = {
    storyID: story.story_id,
    sections: [],
    unassigned: story.chapters.map((chap) => chap.id),
  };

  const onOutlineSectionEdit = async (newOutlineSection: OutlineSection) => {
    const prevOutline = story.outline ?? { ...defaultOutline, sections: [] };
    const sections = prevOutline.sections ?? [];

    const idx = sections.findIndex(
      (section) => section.place === newOutlineSection.place,
    );

    const nextSections =
      idx >= 0
        ? [
            ...sections.slice(0, idx),
            newOutlineSection,
            ...sections.slice(idx + 1),
          ]
        : [...sections, newOutlineSection];

    const updatedStory: Story = {
      ...story,
      outline: {
        ...prevOutline,
        sections: nextSections,
        template: OutlineTemplate.custom,
      },
    };

    try {
      showLoader();
      const res = await fetch(`/api/stories/${updatedStory.story_id}/outline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedStory.outline),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || "Failed to update outline.");
      }
      const json = (await res.json()) as Outline;
      updatedStory.outline = json;
      setStory(updatedStory);
      propagateStoryUpdates(updatedStory);
    } catch (err) {
      setAlertState({
        title: "Error",
        message: (err as Error).message,
        severity: AlertToastType.error,
        open: true,
      });
    } finally {
      hideLoader();
    }
  };

  return (
    <SimpleTreeView>
      <Typography variant="h5" p={2}>
        Outline
      </Typography>
      {story?.outline?.sections?.map((section, idx) => (
        <OutlineStageCard
          key={`outline-${idx}`}
          outlineSection={section}
          unassigned={story.outline?.unassigned}
          onAssociationClick={onAssociationClick}
          onOutlineSectionEdit={onOutlineSectionEdit}
        />
      ))}
    </SimpleTreeView>
  );
};
