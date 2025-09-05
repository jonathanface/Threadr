import { SimpleTreeView } from "@mui/x-tree-view";
import { useSelections } from "../../../../hooks/useSelections";
import { ClickData } from "../../plugins/DocumentClickPlugin";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { OutlineStageCard } from "./OutlineStageCard";
import {
  Outline,
  OutlineSection,
  OutlineTemplate,
} from "../../../../types/Outline";
import { Story } from "../../../../types/Story";
import { useLoader } from "../../../../hooks/useLoader";
import { useToaster } from "../../../../hooks/useToaster";
import { AlertToastType } from "../../../../types/AlertToasts";
import axios from "axios";
import { api } from "../../../../api";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useRef, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ExpandMoreToggle } from "../../../ExpandMoreToggle";

interface OutlineMenuProps {
  onAssociationClick: (data: ClickData) => void;
}

export const OutlineMenu = ({ onAssociationClick }: OutlineMenuProps) => {
  const { story, setStory, propagateStoryUpdates } = useSelections();
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;

    const sections = story?.outline?.sections ?? [];
    // find first section with chapters assigned
    const firstPlaceWithChapters =
      sections.find((s) => (s.chapters?.length ?? 0) > 0)?.place ??
      sections[0]?.place; // fallback to first section

    const next: Record<number, boolean> = {};
    for (const s of sections) {
      const place = s.place ?? 0;
      next[place] = place === firstPlaceWithChapters; // only this one open
    }

    setOpenMap(next);
    initializedRef.current = true;
  }, [story?.outline?.sections]);

  if (!story) {
    return null;
  }
  const defaultOutline: Outline = {
    storyID: story.story_id,
    sections: [],
    unassigned: story.chapters.map((chap) => chap.id),
  };

  const toggleOpen = (place: number) =>
    setOpenMap((m) => ({ ...m, [place]: !m[place] }));

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

  const getChapterCount = (s: OutlineSection) => s.chapters?.length ?? 0;

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
        story.outline.sections?.map((section, idx) => {
          const place = section.place ?? idx + 1;
          const isOpen = openMap[place] ?? true;

          return (
            <Box key={`outline-wrap-${place}`} sx={{ px: 2, pb: 1 }}>
              {/* Section header row (always visible) */}
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  py: 1,
                  px: 1,
                  borderRadius: 1,
                  "&:hover": { backgroundColor: "action.hover" },
                  cursor: "pointer",
                }}
                onClick={() => toggleOpen(place)}
              >
                <ExpandMoreToggle
                  expand={isOpen}
                  size="small"
                  aria-label={`toggle section ${place}`}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    toggleOpen(place);
                  }}
                >
                  <ExpandMoreIcon fontSize="small" />
                </ExpandMoreToggle>

                <Typography variant="subtitle1" sx={{ flex: 1 }}>
                  {section.header?.trim() || `Stage ${place}`}
                </Typography>

                <Chip
                  size="small"
                  label={section.status || "Draft"}
                  sx={{ mr: 0.5 }}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${getChapterCount(section)} ch`}
                />
              </Stack>

              <Collapse in={isOpen} timeout="auto" unmountOnExit>
                <Box sx={{ pt: 1 }}>
                  <OutlineStageCard
                    outlineSection={section}
                    unassigned={story.outline?.unassigned}
                    onAssociationClick={onAssociationClick}
                    onOutlineSectionEdit={onOutlineSectionEdit}
                  />
                </Box>
              </Collapse>

              <Divider sx={{ my: 1.5 }} />
            </Box>
          );
        })
      ) : (
        <Box sx={{ px: 2 }}>
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
        </Box>
      )}
    </SimpleTreeView>
  );
};
