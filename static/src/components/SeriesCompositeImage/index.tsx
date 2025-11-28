import React from "react";
import { Series } from "../../types/Series";
import styles from "./seriescompositeimage.module.css";

interface SeriesCompositeImageProps {
  series: Series;
  onLoad?: () => void;
}

const DEFAULT_SERIES_IMAGE = "/img/icons/story_series_icon.jpg";

export const SeriesCompositeImage: React.FC<SeriesCompositeImageProps> = ({
  series,
  onLoad,
}) => {
  const hasCustomImage =
    series.image_url && series.image_url !== DEFAULT_SERIES_IMAGE;
  const hasStories = series.stories && series.stories.length > 0;

  // Use custom image if available
  if (hasCustomImage) {
    return (
      <div className={styles.imageWrapper}>
        <img
          className={styles.seriesImage}
          src={series.image_url}
          alt={series.series_title}
          onLoad={onLoad}
        />
        <div className={styles.seriesBadge}>SERIES</div>
      </div>
    );
  }

  // Show composite of story images if no custom image
  if (hasStories) {
    const storyImages = series.stories.slice(0, 4);
    const imageCount = storyImages.length;

    return (
      <div className={styles.imageWrapper}>
        <div
          className={`${styles.compositeContainer} ${styles[`count${imageCount}`]}`}
          role="img"
          aria-label={`${series.series_title} series composite`}
        >
          {storyImages.map((story, index) => (
            <div
              key={story.story_id}
              className={styles.compositeImage}
              style={{ backgroundImage: `url(${story.image_url})` }}
              title={story.title}
            >
              {index === 0 && <img src={story.image_url} alt="" onLoad={onLoad} style={{ opacity: 0, position: 'absolute' }} />}
            </div>
          ))}
        </div>
        <div className={styles.seriesBadge}>SERIES</div>
      </div>
    );
  }

  // Fallback to default image
  return (
    <div className={styles.imageWrapper}>
      <img
        className={styles.seriesImage}
        src={DEFAULT_SERIES_IMAGE}
        alt={series.series_title}
        onLoad={onLoad}
      />
      <div className={styles.seriesBadge}>SERIES</div>
    </div>
  );
};
