import React, { useState, useEffect } from "react";
import { Autocomplete, TextField, Chip, Box, Typography } from "@mui/material";
import { Series } from "../../../types/Series";

interface AvailableSeries {
  series_id?: string;
  series_name: string;
}

interface StorySeriesSelectorProps {
  seriesList: Series[];
  selectedSeries: AvailableSeries | null;
  onSeriesChange: (series: AvailableSeries | null) => void;
}

export const StorySeriesSelector: React.FC<StorySeriesSelectorProps> = ({
  seriesList,
  selectedSeries,
  onSeriesChange,
}) => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Get initial theme
    const currentTheme = document.documentElement.getAttribute('data-theme') as "light" | "dark" || "light";
    setTheme(currentTheme);

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const newTheme = document.documentElement.getAttribute('data-theme') as "light" | "dark" || "light";
      setTheme(newTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const availableSeries: AvailableSeries[] = seriesList.map((series) => ({
    series_id: series.series_id,
    series_name: series.series_title,
  }));

  const handleInputChange = (_event: React.SyntheticEvent, value: string) => {
    const foundSeries = seriesList.find(
      (srs: Series) => srs.series_title.toLowerCase() === value.toLowerCase()
    );

    if (foundSeries) {
      onSeriesChange({
        series_name: foundSeries.series_title,
        series_id: foundSeries.series_id,
      });
    } else if (value.length) {
      onSeriesChange({
        series_name: value,
      });
    } else {
      onSeriesChange(null);
    }
  };

  const isNewSeries = selectedSeries && !selectedSeries.series_id;

  return (
    <Box>
      <Autocomplete
        options={availableSeries}
        getOptionLabel={(option) => option.series_name}
        value={selectedSeries}
        onInputChange={handleInputChange}
        onChange={(_event, newValue) => onSeriesChange(newValue)}
        slotProps={{
          paper: {
            sx: {
              background: theme === 'light'
                ? 'linear-gradient(135deg, #eef4fa 0%, #f5f9fc 100%)'
                : 'var(--bg-primary)',
              '& .MuiPaper-root': {
                transitionProperty: 'none !important',
              },
            },
          },
        }}
        componentsProps={{
          popper: {
            disablePortal: false,
            placement: 'bottom-start',
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Assign to Series (optional)"
            margin="normal"
            inputProps={{
              ...params.inputProps,
              "aria-label": "Series assignment",
              "aria-describedby": "series-helper",
            }}
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option.series_id || option.series_name}>
            {option.series_name}
          </li>
        )}
      />
      <Typography
        id="series-helper"
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.5, ml: 1.5 }}
      >
        {isNewSeries ? (
          <>
            <Chip
              label="New"
              size="small"
              color="success"
              sx={{ height: 16, fontSize: "0.7rem", mr: 0.5 }}
            />
            Typing a new name will create a new series
          </>
        ) : (
          "Select an existing series or type a new name to create one"
        )}
      </Typography>
    </Box>
  );
};
