import { Story } from "./Story";

export interface Series {
  series_id: string;
  series_title: string;
  series_description: string;
  stories: Story[];
  created_at: number;
  image_url: string;
}

export interface SeriesPanel {
  isEditingSeries: boolean;
  seriesList: Series[];
  seriesBeingEdited: Series | null;
}
