import { Chapter } from "./Chapter";
import { OutlineSection } from "./Outline";

export interface Story {
  story_id: string;
  created_at?: number;
  title: string;
  description: string;
  series_id?: string;
  chapters: Chapter[];
  outline?: OutlineSection[];
  place?: number;
  image_url: string;
}

