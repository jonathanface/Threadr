import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sharedApi } from "../../api/shared";
import { SharedStoryResponse } from "../../types/Sharing";
import { ReadOnlyViewer } from "../../components/ReadOnlyViewer";
import { Typography, Box, Button, FormControl, InputLabel, Select, MenuItem } from "@mui/material";


export const SharedReaderPage = () => {
  const { token } = useParams<{ token: string }>();
  const [storyData, setStoryData] = useState<SharedStoryResponse | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchStory = async () => {
      try {
        setLoading(true);
        const res = await sharedApi.get<SharedStoryResponse>(`/${token}`);
        setStoryData(res.data);

        // Auto-select first chapter
        if (res.data.chapters?.length > 0) {
          const sorted = [...res.data.chapters].sort(
            (a, b) => a.place - b.place,
          );
          setSelectedChapterId(sorted[0].id);
        }
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "response" in err &&
          (err as { response?: { status?: number } }).response?.status === 410
        ) {
          setError(
            "This share link has expired or been revoked.",
          );
        } else if (
          err &&
          typeof err === "object" &&
          "response" in err &&
          (err as { response?: { status?: number } }).response?.status === 404
        ) {
          setError("Share link not found.");
        } else {
          setError("Failed to load shared story.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [token]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="60vh"
        gap={2}
      >
        <Typography variant="h5">{error}</Typography>
        <Button variant="contained" href="/">
          Go Home
        </Button>
      </Box>
    );
  }

  if (!storyData || !token) return null;

  const sortedChapters = [...storyData.chapters].sort(
    (a, b) => a.place - b.place,
  );

  return (
    <Box sx={{ padding: 2 }}>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        {storyData.image_url && (
          <Box sx={{ mb: 2 }}>
            <img
              src={storyData.image_url}
              alt={storyData.title}
              style={{ maxWidth: 300, maxHeight: 300, borderRadius: 8, objectFit: "cover" }}
            />
          </Box>
        )}
        <Typography variant="h4">{storyData.title}</Typography>
        {storyData.author_name && (
          <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 0.5 }}>
            By {storyData.author_name}
          </Typography>
        )}
        {storyData.description && (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            {storyData.description}
          </Typography>
        )}
      </Box>

      {selectedChapterId && (() => {
        const currentIndex = sortedChapters.findIndex((c) => c.id === selectedChapterId);
        const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
        const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;
        const showNav = sortedChapters.length > 1;

        return (
          <ReadOnlyViewer
            token={token}
            storyId={storyData.story_id}
            chapterId={selectedChapterId}
            commentsEnabled={storyData.comments_enabled}
            readerFirstName={storyData.reader_first_name}
            readerLastName={storyData.reader_last_name}
            onPrevChapter={showNav && prevChapter ? () => setSelectedChapterId(prevChapter.id) : undefined}
            onNextChapter={showNav && nextChapter ? () => setSelectedChapterId(nextChapter.id) : undefined}
            showNav={showNav}
            chapterSelector={
              sortedChapters.length > 1 ? (
                <FormControl size="small" sx={{ minWidth: 200, maxWidth: 300 }}>
                  <InputLabel>Chapter</InputLabel>
                  <Select
                    value={selectedChapterId}
                    label="Chapter"
                    onChange={(e) => setSelectedChapterId(e.target.value)}
                  >
                    {sortedChapters.map((chapter) => (
                      <MenuItem key={chapter.id} value={chapter.id}>
                        {chapter.title || `Chapter ${chapter.place + 1}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : undefined
            }
          />
        );
      })()}
    </Box>
  );
};
