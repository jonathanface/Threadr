import React, { useState } from "react";
import styles from "./seriesbox.module.css";
import { Series } from "../../types/Series";
import { Box, CircularProgress, IconButton } from "@mui/material";

import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useNavigate } from "react-router-dom";
import { useLoader } from "../../hooks/useLoader";
import { useWorksList } from "../../hooks/useWorksList";
import { StoryOrSeriesDetailsSlider } from "../StoryOrSeriesDetailsSlider";
import { StoryListSlider } from "../StoryListSlider";
import { SeriesCompositeImage } from "../SeriesCompositeImage";
import axios from "axios";
import { api } from "../../api";

interface SeriesBoxProps {
  series: Series;
}

export const SeriesBox: React.FC<SeriesBoxProps> = ({ series }) => {
  const [isSeriesLoaderVisible, setIsSeriesLoaderVisible] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);
  const [isDetailsSliderVisible, setIsDetailsSliderVisible] = useState(false);
  const [isListSliderVisible, setIsListSliderVisible] = useState(false);
  const { showLoader, hideLoader } = useLoader();
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

        // Note: 0 is a valid index; check > -1
        if (storiesList && seriesList && foundSeriesIndex > -1) {
          const newStandaloneList = [...storiesList];
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

  const showDetailsSlider = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isListSliderVisible) {
      setIsDetailsSliderVisible(true);
    }
  };
  const hideDetailsSlider = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsDetailsSliderVisible(false);
  };

  const showListSlider = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isListSliderVisible && isDetailsSliderVisible) {
      setIsDetailsSliderVisible(false);
    }
    setIsListSliderVisible(true);
  };

  return !wasDeleted ? (
    <div
      className={styles.seriesBoxContainer}
      onMouseEnter={showDetailsSlider}
      onMouseLeave={hideDetailsSlider}
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
        <div className={styles.seriesLabel}>
          <span className={styles.title}>{series.series_title}</span>
          <span className={styles.buttons}>
            <IconButton
              aria-label="edit series"
              sx={{ padding: "0" }}
              component="label"
              title={`Edit ${series.series_title}`}
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
                    color: "#2a57e3",
                  },
                }}
              />
            </IconButton>
            <IconButton
              aria-label="delete"
              component="label"
              title={`Delete ${series.series_title}`}
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
                    color: "#2a57e3",
                  },
                }}
              />
            </IconButton>
          </span>
        </div>
      </div>
      <StoryOrSeriesDetailsSlider
        onShowMoreClick={showListSlider}
        id={series.series_id}
        visible={isDetailsSliderVisible}
        stories={series.stories}
        chapters={undefined}
        setDeleted={setWasDeleted}
        onStoryClick={handleStoryClick}
        isSeries={true}
        title={series.series_title}
        description={series.series_description}
      />
      <StoryListSlider
        series={series}
        visible={isListSliderVisible}
        onStoryClick={handleStoryClick}
        onClose={() => {
          setIsListSliderVisible(false);
        }}
      />
    </div>
  ) : (
    ""
  );
};
