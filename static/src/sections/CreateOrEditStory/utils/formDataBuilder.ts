interface StoryFormData {
  [key: string]: string | undefined | File | number;
  story_id?: string;
  title?: string;
  description?: string;
  series_id?: string;
  series_name?: string;
  series_title?: string;
  image?: File;
  image_url?: string;
  series_place?: number;
}

export const buildStoryFormData = (data: StoryFormData): FormData => {
  const formData = new FormData();

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];

      if (value === undefined) continue;

      if (typeof value === "string" || typeof value === "number") {
        formData.append(key, value.toString());
        continue;
      }

      if (value instanceof File) {
        formData.append("file", value);
      }
    }
  }

  return formData;
};
