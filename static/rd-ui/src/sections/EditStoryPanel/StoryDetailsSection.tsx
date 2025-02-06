import { Autocomplete, Box, TextField } from "@mui/material";
import styles from "./editStoryPanel.module.css";
import { useState } from "react";
import { Series } from "../../types/Series";
import { Story } from "../../types/Story";

export interface SeriesSelectionOptions {
    label: string;
    id: string;
    count: number;
}

interface StoryDetailsSectionProps {
    onTitleChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    isInASeries: boolean;
    memberOfSeries?: Series;
    editingStory?: Story;
    seriesDisplayList: SeriesSelectionOptions[];
    seriesList: Series[] | null; // adjust type as needed
    onToggleSeries: () => void;
    onSeriesChange: (value: string, seriesId?: string) => void;
    defaultSeriesTitle?: string;
}
export const StoryDetailsSection: React.FC<StoryDetailsSectionProps> = ({
    onTitleChange,
    onDescriptionChange,
    isInASeries,
    memberOfSeries,
    editingStory,
    seriesDisplayList,
    seriesList,
    onToggleSeries,
    onSeriesChange,
    defaultSeriesTitle
}) => {

    const [seriesTitle, setSeriesTitle] = useState(defaultSeriesTitle || "");

    const handleSeriesChange = (text: string, foundSeries?: Series) => {
        if (foundSeries) {
            onSeriesChange(foundSeries.series_title, foundSeries.series_id);
        } else {
            onSeriesChange(text);
        }
    }
    return (
        <Box className={styles.right}>
            <div className={styles.fieldRow}>
                <label htmlFor="story-title">Title:</label>
                <TextField sx={{
                    fieldset: { border: 'none' }
                }} value={editingStory?.title || ""} onChange={(e) => { onTitleChange(e.target.value) }} />
            </div>
            <div className={styles.fieldRow}>
                <label htmlFor="story-description">Description:</label>
                <textarea
                    value={editingStory?.description || ""}
                    spellCheck="false"
                    id="create-story-description"
                    onChange={(event) => onDescriptionChange(event.target.value)}
                />
            </div>
            <div className={styles.fieldRow}>
                <input
                    type="checkbox"
                    id="story-is-in-series"
                    checked={isInASeries}
                    onChange={onToggleSeries}
                />
                <label htmlFor="story-is-in-series">This is part of a series</label>
                {isInASeries && (
                    <Autocomplete
                        value={seriesTitle}
                        onInputChange={(event: React.SyntheticEvent, value: string) => {
                            // Find a matching series if it exists.
                            const foundSeries = seriesList?.find(
                                (srs: any) => srs.series_title.toLowerCase() === value.toLowerCase()
                            );
                            handleSeriesChange(value, foundSeries);
                        }}
                        onChange={(event: React.SyntheticEvent, value: any) => {
                            if (value && value.id && value.label) {
                                onSeriesChange(value.label, value.id);
                            }
                        }}
                        freeSolo
                        options={seriesDisplayList}
                        renderInput={(params) => <TextField sx={{
                            fieldset: { border: 'none' },
                            padding: 0
                        }} {...params} />}
                    />
                )}
            </div>
        </Box>
    );
}
