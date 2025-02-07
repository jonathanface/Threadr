import { Box, CircularProgress, Typography } from "@mui/material"
import styles from './createeditstoryslideshow.module.css';
import { PortraitDropper } from "../../components/PortraitDropper";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoader } from "../../hooks/useLoader";

interface ImageStepProps {
    title: string;
    onComplete: (acceptedFiles: File[]) => void;
    initialImageURL?: string;
}

export const ImageStep = (props: ImageStepProps) => {
    const randomImageURL = "https://picsum.photos/300";
    const defaultImageURL = "img/icons/story_standalone_icon.jpg";
    const [imageURL, setImageURL] = useState(defaultImageURL)
    const { showLoader, hideLoader } = useLoader();
    const defaultImageFetchedRef = useRef(false);
    const [isStoryLoaderVisible, setIsStoryLoaderVisible] = useState(true);

    const getDefaultImageURL = useCallback(async () => {
        try {
            if (!defaultImageFetchedRef.current && !props.initialImageURL) {
                defaultImageFetchedRef.current = true;
                showLoader();
                const response = await fetch(randomImageURL);
                if (!response.ok) throw new Error(response.statusText);
                const data = await response.blob();
                const metadata = {
                    type: 'image/jpeg'
                };
                const file = new File([data], "temp.jpg", metadata);
                props.onComplete([file]);
                return response.url;
            }
            if (props.initialImageURL) return props.initialImageURL
            return imageURL;
        } catch (error) {
            console.error(`Error fetching random image: ${error}`);
            return defaultImageURL;
        } finally {
            hideLoader();
        }
    }, [showLoader, hideLoader, imageURL, props]);

    useEffect(() => {
        const generateImageURL = async () => {
            const url = await getDefaultImageURL();
            setImageURL(url);
        };
        generateImageURL();
    }, [getDefaultImageURL]);

    const onImageLoad = () => {
        setIsStoryLoaderVisible(false);
    }

    return (
        <Box className={styles.formContainer}>
            <Typography>You may upload an image to represent your story, or use a stock one like this.</Typography>
            <div className={styles.portraitWrapper}>
                <div
                    className="loading-screen"
                    style={{ visibility: isStoryLoaderVisible ? "visible" : "hidden" }}
                >
                    <Box className="progress-box" />
                    <Box className="prog-anim-holder">
                        <CircularProgress />
                    </Box>
                </div>
                <PortraitDropper
                    imageURL={imageURL}
                    name={props.title}
                    onComplete={props.onComplete}
                    onImageLoaded={onImageLoad}
                />
            </div>
        </Box>
    )
}