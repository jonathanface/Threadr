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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const IsStory = (obj: any): obj is Story => {
  return (
    obj &&
    typeof obj.story_id === "string" &&
    (typeof obj.created_at === "number" ||
      typeof obj.created_at === "undefined") &&
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    (typeof obj.series_id === "string" ||
      typeof obj.series_id === "undefined") &&
    Array.isArray(obj.chapters) &&
    (typeof obj.place === "number" || obj.place === "undefined") &&
    typeof obj.image_url === "string"
  );
};
