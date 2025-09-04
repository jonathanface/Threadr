import { SimpleTreeView } from "@mui/x-tree-view";
import { useSelections } from "../../hooks/useSelections";
import { ClickData } from "../ThreadWriter/plugins/DocumentClickPlugin";
import { Button, Stack, Typography } from "@mui/material";
import { OutlineStageCard } from "./OutlineStageCard";
import { Outline, OutlineSection, OutlineTemplate } from "../../types/Outline";
import { Story } from "../../types/Story";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { AlertToastType } from "../../types/AlertToasts";
import axios from "axios";
import { api } from "../../api";
import AddIcon from "@mui/icons-material/Add";

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

      const { data: json } = await api.put<Outline>(
        `/stories/${updatedStory.story_id}/outline`,
        updatedStory.outline,
        {
          headers: { "Content-Type": "application/json" },
        },
      );

      updatedStory.outline = json;
      setStory(updatedStory);
      propagateStoryUpdates(updatedStory);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (axios.isAxiosError(err) && (err.response?.data as any)?.message) ||
        (err as Error).message ||
        "Failed to update outline.";

      setAlertState({
        title: "Error",
        message,
        severity: AlertToastType.error,
        open: true,
      });
    } finally {
      hideLoader();
    }
  };

  const handleAddSection = () => {
    const existing = story.outline?.sections ?? [];
    const nextPlace =
      existing.length > 0
        ? Math.max(...existing.map((s) => s.place || 0)) + 1
        : 1;

    const newSection: OutlineSection = {
      header: "",
      description: "",
      place: nextPlace,
      text: "",
      chapters: [],
      status: "Draft",
    };
    void onOutlineSectionEdit(newSection);
  };

  return (
    <SimpleTreeView>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2}
        py={1.5}
      >
        <Typography variant="h5">Outline</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAddSection}
          variant="outlined"
        >
          Add section
        </Button>
      </Stack>
      {story?.outline ? (
        story.outline.sections?.map((section, idx) => (
          <OutlineStageCard
            key={`outline-${idx}`}
            outlineSection={section}
            unassigned={story.outline?.unassigned}
            onAssociationClick={onAssociationClick}
            onOutlineSectionEdit={onOutlineSectionEdit}
          />
        ))
      ) : (
        <OutlineStageCard
          key="outline-0"
          outlineSection={{
            header: "",
            description: "",
            place: 1,
            text: "",
            chapters: [],
            status: "Draft",
          }}
          unassigned={story.chapters.map((chapter) => chapter.id)}
          onAssociationClick={onAssociationClick}
          onOutlineSectionEdit={onOutlineSectionEdit}
        />
      )}
    </SimpleTreeView>
  );
};
