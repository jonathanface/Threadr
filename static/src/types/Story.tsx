import { Chapter } from "./Chapter";
import { Outline } from "./Outline";

export interface Story {
  story_id: string;
  created_at?: number;
  title: string;
  description: string;
  series_id?: string;
  chapters: Chapter[];
  outline?: Outline;
  place?: number;
  image_url: string;
}

