import React, { useState } from "react";
import styles from "./seriesbox.module.css";
import { Series } from "../../types/Series";
import { Avatar, Box, Chip, CircularProgress, IconButton, Tooltip } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { useNavigate } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useToaster } from "../../hooks/useToaster";
import { useWorksList } from "../../hooks/useWorksList";
import { AlertToastType } from "../../types/AlertToasts";
import { SeriesCompositeImage } from "../SeriesCompositeImage";
import axios from "axios";
import { api } from "../../api";

interface SeriesBoxProps {
  series: Series;
}

export const SeriesBox: React.FC<SeriesBoxProps> = ({ series }) => {
  const [isSeriesLoaderVisible, setIsSeriesLoaderVisible] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);
  const { showLoader, hideLoader } = useLoader();
  const { setAlertState } = useToaster();
  const { seriesList, storiesList, setSeriesList, setStoriesList } =
    useWorksList();
  const navigate = useNavigate();

  const editSeries = (event: React.MouseEvent, seriesID: string) => {
    event.stopPropagation();
    navigate(`/series/${seriesID}/edit`);
  };

  const handleStoryClick = (event: React.MouseEvent, storyID: string) => {
    event.stopPropagation();
    navigate(`/stories/${storyID}`);
  };

  const deleteSeries = async (
    event: React.MouseEvent,
    id: string,
    title: string,
  ) => {
    event.stopPropagation();
    const confirmText =
      "Delete series " +
      title +
      "? Any volumes assigned to it will be converted to standalone stories.";
    const conf = window.confirm(confirmText);
    if (conf) {
      try {
        showLoader();

        const res = await api.delete(`/series/${id}`, {
          headers: { "Content-Type": "application/json" },
        });

        // Accept 200/204 success, or 501 (your soft case)
        if (![200, 204, 501].includes(res.status)) {
          const payload =
            typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          throw new Error(payload || "Unexpected delete response");
        }

        setWasDeleted(true);

        const foundSeriesIndex =
          seriesList?.findIndex((srs) => srs.series_id === id) ?? -1;

        let convertedCount = 0;

        // Note: 0 is a valid index; check > -1
        if (storiesList && seriesList && foundSeriesIndex > -1) {
          const newStandaloneList = [...storiesList];
          convertedCount = seriesList[foundSeriesIndex].stories.length;
          seriesList[foundSeriesIndex].stories.forEach((story) => {
            const newStory = { ...story };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (newStory as any).series_id;
            newStandaloneList.push(newStory);
          });
          setStoriesList(newStandaloneList);

          const newSeriesList = [...seriesList];
          newSeriesList.splice(foundSeriesIndex, 1);
          setSeriesList(newSeriesList);
        }

        const storyWord = convertedCount === 1 ? "story has" : "stories have";
        setAlertState({
          title: `Series "${title}" deleted`,
          message: convertedCount > 0
            ? `${convertedCount} ${storyWord} been converted to standalone.`
            : "",
          severity: AlertToastType.success,
          open: true,
        });
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? typeof error.response?.data === "string"
            ? error.response?.data
            : JSON.stringify(error.response?.data)
          : String(error);
        console.error(`Error deleting series: ${msg}`);
      } finally {
        hideLoader();
      }
    }
  };


  const storyCount = series.stories?.length || 0;

  const handleCardClick = () => {
    navigate(`/series/${series.series_id}/edit`);
  };

  return !wasDeleted ? (
    <div
      className={styles.seriesBoxContainer}
      onClick={handleCardClick}
    >
      <div
        className="loading-screen"
        style={{ visibility: isSeriesLoaderVisible ? "visible" : "hidden" }}
      >
        <Box className="progress-box" />
        <Box className="prog-anim-holder">
          <CircularProgress />
        </Box>
      </div>
      <div className={styles.seriesBubble}>
        <SeriesCompositeImage
          series={series}
          onLoad={() => {
            setIsSeriesLoaderVisible(false);
          }}
        />
      </div>
      <div className={styles.seriesLabel}>
        <span className={styles.title}>{series.series_title}</span>
        <span className={styles.buttons}>
          <Chip
            icon={<MenuBookIcon sx={{ fontSize: "14px !important" }} />}
            label={storyCount}
            size="small"
            sx={{
              height: 22,
              fontSize: "0.7rem",
              fontWeight: 600,
              bgcolor: "rgba(255,255,255,0.15)",
              color: "#fff",
              "& .MuiChip-icon": { color: "#fff" },
              "[data-theme='light'] &": {
                bgcolor: "rgba(0,0,0,0.08)",
                color: "#1a1a1a",
                "& .MuiChip-icon": { color: "#1a1a1a" },
              },
            }}
          />
          <Tooltip title={`Edit ${series.series_title}`} placement="top">
            <IconButton
              aria-label="edit series"
              sx={{ padding: "0" }}
              component="label"
              onClick={(event) => {
                editSeries(event, series.series_id);
              }}
            >
              <EditIcon
                sx={{
                  padding: "0",
                  fontSize: "18px",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#d97706",
                  },
                }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={`Delete ${series.series_title}`} placement="top">
            <IconButton
              aria-label="delete"
              component="label"
              onClick={(event) => {
                deleteSeries(event, series.series_id, series.series_title);
              }}
            >
              <DeleteIcon
                sx={{
                  fontSize: "18px",
                  padding: "0",
                  color: "#F0F0F0",
                  "&:hover": {
                    fontWeight: "bold",
                    color: "#d97706",
                  },
                }}
              />
            </IconButton>
          </Tooltip>
        </span>
      </div>

      {/* Story list strip — always visible at bottom */}
      <div className={styles.storyStrip}>
        {storyCount > 0 && series.stories.map((story) => (
          <div
            key={story.story_id}
            className={styles.storyStripItem}
            onClick={(event) => handleStoryClick(event, story.story_id)}
          >
            <Avatar
              alt={story.title}
              src={story.image_url}
              sx={{ width: 24, height: 24, flexShrink: 0 }}
            />
            <span className={styles.storyStripTitle}>{story.title}</span>
          </div>
        ))}
        <div
          className={styles.storyStripItem}
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/series/${series.series_id}/add`);
          }}
        >
          <AddIcon sx={{ fontSize: 20, color: "rgba(255,255,255,0.5)" }} />
          <span className={`${styles.storyStripTitle} ${styles.addLabel}`}>Add story</span>
        </div>
      </div>

    </div>
  ) : (
    ""
  );
};
