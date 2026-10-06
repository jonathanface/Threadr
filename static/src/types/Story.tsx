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
  inactive?: boolean;
  // Drafts: a draft is a sibling Story row keyed by original_story_id =
  // root.id. Absent on root rows. is_current_draft marks the one row
  // across the ancestry that the stories list and share links default to.
  original_story_id?: string;
  draft_name?: string;
  is_current_draft?: boolean;
}
