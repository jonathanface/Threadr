import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  alpha,
  Dialog,
} from "@mui/material";

interface OnboardingPage {
  title: string;
  description: string;
  emoji: string;
}

interface WelcomeModalProps {
  open: boolean;
  isReturningUser: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  open,
  isReturningUser,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState(0);

  const pages: OnboardingPage[] = isReturningUser
    ? [
        {
          title: "Welcome Back!",
          description:
            "We're glad to have you back. Your account has been reactivated and any content from before the 30-day retention period has been restored.",
          emoji: "👋",
        },
        {
          title: "Your Data",
          description:
            "Since you returned within 30 days, your stories and series have been automatically restored. Content is permanently deleted after 30 days of account deletion.",
          emoji: "🔄",
        },
        {
          title: "Ready to Write",
          description:
            "Everything is set up and ready to go. Let's continue creating something amazing!",
          emoji: "✨",
        },
      ]
    : [
        {
          title: "Welcome to Docter.io",
          description:
            "Your personal writing companion for organizing stories, characters, places, and events all in one place.",
          emoji: "📝",
        },
        {
          title: "Create & Organize",
          description:
            "Write your stories in chapters, create rich associations for characters and places, and keep everything connected.",
          emoji: "🗂️",
        },
        {
          title: "Series Support",
          description:
            "Building a multi-book series? Group related stories together and track your entire fictional universe.",
          emoji: "📚",
        },
        {
          title: "Export Anywhere",
          description:
            "Export your work to PDF, EPUB, or DOCX format whenever you need it. Your stories, your way.",
          emoji: "📤",
        },
      ];

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = () => {
    handleGetStarted();
  };

  const handleGetStarted = () => {
    onClose();
  };

  const currentPageData = pages[currentPage];

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        // Prevent closing by clicking outside or pressing escape
        if (reason !== "backdropClick" && reason !== "escapeKeyDown") {
          onClose();
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
          minHeight: "500px",
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
            fontSize: { xs: "4rem", sm: "5rem" },
            mb: 4,
          }}
        >
          {currentPageData.emoji}
        </Box>

        <Typography
          variant="h4"
          sx={(t) => ({
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            color: t.palette.text.primary,
            mb: 2,
          })}
        >
          {currentPageData.title}
        </Typography>

        <Typography
          sx={(t) => ({
            fontSize: { xs: "1rem", sm: "1.125rem" },
            color: t.palette.text.secondary,
            lineHeight: 1.6,
            maxWidth: 500,
            mx: "auto",
            mb: 4,
          })}
        >
          {currentPageData.description}
        </Typography>

        {/* Pagination dots */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 1,
            my: 4,
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
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 4 }}>
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
            {currentPage === pages.length - 1 ? "Get Started" : "Next"}
          </Button>

          {currentPage < pages.length - 1 && (
            <Button
              variant="text"
              size="large"
              onClick={handleSkip}
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
