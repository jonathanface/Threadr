import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  alpha,
  Dialog,
} from "@mui/material";

interface TutorialPage {
  title: string;
  description: string;
  visual: string;
}

interface AssociationTutorialProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "docter_seen_association_tutorial";

export const hasSeenTutorial = () =>
  localStorage.getItem(STORAGE_KEY) === "true";

export const markTutorialSeen = () =>
  localStorage.setItem(STORAGE_KEY, "true");

const pages: TutorialPage[] = [
  {
    title: "Meet Story Associations",
    description:
      "Associations let you link characters, places, events, and items directly to your manuscript. Once linked, every mention is just one click away from its full profile.",
    visual: "link",
  },
  {
    title: "Highlight & Link",
    description:
      "Select any word or phrase in your manuscript, right-click, and choose \"Make Association.\" Pick a type — Character, Place, Event, or Item — and fill in the details.",
    visual: "highlight",
  },
  {
    title: "Instant Recall",
    description:
      "Linked words appear highlighted in your text. Click one to instantly pull up its profile — descriptions, portraits, notes — without leaving the page you're writing.",
    visual: "recall",
  },
  {
    title: "Automatic Recognition",
    description:
      "Once you create an association, every matching mention across your chapter is automatically highlighted. You'll never lose track of a character or place again.",
    visual: "auto",
  },
  {
    title: "Chapter Navigation",
    description:
      "Use the menu on the right side of the editor to switch between chapters, add new ones, or drag to reorder them. Your work saves automatically as you write.",
    visual: "chapters",
  },
];

export const AssociationTutorial: React.FC<AssociationTutorialProps> = ({
  open,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    markTutorialSeen();
    onClose();
  };

  const current = pages[currentPage];

  const visuals: Record<string, string> = {
    link: "\u{1F517}",
    highlight: "\u{1F58A}\u{FE0F}",
    recall: "\u{1F50D}",
    auto: "\u{2728}",
    chapters: "\u{1F4D1}",
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick" && reason !== "escapeKeyDown") {
          handleDismiss();
        }
      }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: (t) => ({
          bgcolor: alpha(t.palette.background.paper, 0.98),
          backdropFilter: "blur(8px)",
          borderRadius: "12px",
          border: "1px solid",
          borderColor: t.palette.divider,
          minHeight: "460px",
          display: "flex",
          flexDirection: "column",
        }),
      }}
    >
      <Box
        sx={{
          textAlign: "center",
          py: 4,
          px: 3,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Box
          sx={{
            fontSize: { xs: "3.5rem", sm: "4.5rem" },
            mb: 3,
          }}
        >
          {visuals[current.visual]}
        </Box>

        <Typography
          variant="h4"
          sx={(t) => ({
            fontSize: { xs: "1.5rem", sm: "1.75rem" },
            fontWeight: 700,
            color: t.palette.text.primary,
            mb: 2,
          })}
        >
          {current.title}
        </Typography>

        <Typography
          sx={(t) => ({
            fontSize: { xs: "0.95rem", sm: "1.05rem" },
            color: t.palette.text.secondary,
            lineHeight: 1.7,
            maxWidth: 460,
            mx: "auto",
            mb: 3,
          })}
        >
          {current.description}
        </Typography>

        {/* Pagination dots */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 1,
            my: 3,
          }}
        >
          {pages.map((_, index) => (
            <Box
              key={index}
              sx={(t) => ({
                width: index === currentPage ? 24 : 8,
                height: 8,
                borderRadius: 4,
                bgcolor:
                  index === currentPage
                    ? t.palette.primary.main
                    : alpha(t.palette.text.secondary, 0.3),
                transition: "all 0.3s ease",
              })}
            />
          ))}
        </Box>

        {/* Buttons */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 3 }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleNext}
            fullWidth
            sx={{
              py: 1.5,
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {currentPage === pages.length - 1 ? "Start Writing" : "Next"}
          </Button>

          {currentPage < pages.length - 1 && (
            <Button
              variant="text"
              size="large"
              onClick={handleDismiss}
              fullWidth
              sx={(t) => ({
                py: 1,
                fontSize: "0.875rem",
                color: t.palette.text.secondary,
              })}
            >
              Skip
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  );
};
