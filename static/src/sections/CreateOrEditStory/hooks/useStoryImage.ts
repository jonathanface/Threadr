import { useState, useCallback, useRef } from "react";
import { useLoader } from "../../../hooks/useLoader";

const DEFAULT_IMAGE_URL = "img/icons/story_standalone_icon.jpg";
const RANDOM_IMAGE_URL = "https://picsum.photos/300";

export const useStoryImage = () => {
  const [imageURL, setImageURL] = useState(DEFAULT_IMAGE_URL);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const tempImageFile = useRef<File | undefined>(undefined);
  const defaultImageFetchedRef = useRef(false);

  const { showLoader, hideLoader } = useLoader();

  const processImage = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => {};
      reader.onerror = () => console.error("File reading has failed");
      reader.onload = () => {
        const url = URL.createObjectURL(file);
        setImagePreview(url);
        setImageURL(url);
        tempImageFile.current = file;
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const getRandomImageURL = useCallback(async (): Promise<string> => {
    if (defaultImageFetchedRef.current) {
      return imageURL;
    }

    try {
      defaultImageFetchedRef.current = true;
      setIsImageLoading(true);
      showLoader();

      const res = await fetch(RANDOM_IMAGE_URL);

      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status}`);
      }

      const blob = await res.blob();
      const fileType = blob.type || "image/jpeg";
      tempImageFile.current = new File([blob], "temp.jpg", { type: fileType });

      const finalUrl = res.url || RANDOM_IMAGE_URL;
      return finalUrl;
    } catch (error) {
      console.error(`Error fetching random image:`, error);
      return DEFAULT_IMAGE_URL;
    } finally {
      setIsImageLoading(false);
      hideLoader();
    }
  }, [showLoader, hideLoader, imageURL]);

  const setImage = useCallback((url: string) => {
    setImageURL(url);
    setImagePreview(url);
  }, []);

  const onImageLoad = useCallback(() => {
    setIsImageLoading(false);
  }, []);

  const resetImage = useCallback(() => {
    setImageURL(DEFAULT_IMAGE_URL);
    setImagePreview(null);
    tempImageFile.current = undefined;
  }, []);

  return {
    imageURL,
    imagePreview,
    isImageLoading,
    tempImageFile,
    processImage,
    getRandomImageURL,
    setImage,
    onImageLoad,
    resetImage,
  };
};
