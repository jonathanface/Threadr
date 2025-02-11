import { Autocomplete, Box, TextField, Theme, ThemeProvider, Typography } from '@mui/material';
import styles from './createeditstoryslideshow.module.css';
import { useWorksList } from '../../hooks/useWorksList';
import { useEffect, useState } from 'react';
import { Series } from '../../types/Series';

interface SeriesSelectionOptions {
    label: string;
    id: string;
    count: number;
}

interface SeriesSelectionProps {
    onSeriesChange: (value: string, seriesId?: string) => void;
    theme: Theme;
}

export const SeriesStep = (props: SeriesSelectionProps) => {

    const { seriesList } = useWorksList();
    const [seriesOptions, setSeriesOptions] = useState<SeriesSelectionOptions[]>([])
    const [seriesTitle] = useState("");

    useEffect(() => {
        if (seriesList) {
            setSeriesOptions(seriesList.map((entry, index) => {
                return {
                    label: entry.series_title,
                    id: entry.series_id,
                    count: index
                }
            }))
        }
    }, [seriesList]);

    const handleSeriesChange = (text: string, foundSeries?: Series) => {
        console.log("wtf", text, foundSeries)
        if (foundSeries) {
            props.onSeriesChange(foundSeries.series_title, foundSeries.series_id);
        } else {
            props.onSeriesChange(text);
        }
    }

    return (
        <ThemeProvider theme={props.theme}>
            <Box className={styles.formContainer}>
                <Typography sx={{ mb: 2 }}>Is this work part of a larger series? You may select a series below, enter a new one, or leave it blank.</Typography>
                <Autocomplete
                    sx={{
                        maxWidth: '500px'
                    }}

                    value={seriesTitle}
                    onInputChange={(_event: React.SyntheticEvent, value: string) => {
                        // Find a matching series if it exists.
                        const foundSeries = seriesList?.find(
                            (srs: Series) => srs.series_title.toLowerCase() === value.toLowerCase()
                        );
                        handleSeriesChange(value, foundSeries);
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onChange={(_event: React.SyntheticEvent, value: any) => {
                        if (value && value.id && value.label) {
                            props.onSeriesChange(value.label, value.id);
                        }
                    }}
                    freeSolo
                    options={seriesOptions}
                    renderInput={(params) => <TextField sx={{
                        fieldset: { border: 'none' },
                        padding: 0
                    }} {...params} placeholder='Series name...' />}
                />
            </Box>
        </ThemeProvider>
    )
}