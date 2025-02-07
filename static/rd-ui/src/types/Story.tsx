import { Chapter } from "./Chapter";

export interface Story {
  story_id: string;
  created_at?: number;
  title: string;
  description: string;
  series_id?: string;
  chapters: Chapter[];
  place?: number;
  image_url: string;
}

