import { Box } from "@mui/material";
import { PortraitDropper } from "../../components/PortraitDropper";
import styles from "./editStoryPanel.module.css";

interface StoryImageSectionProps {
    imageURL: string | null;
    imageName: string;
    onImageLoaded: () => void;
    processImage: (files: File[]) => void;
}
export const StoryImageSection: React.FC<StoryImageSectionProps> = ({
    imageURL,
    imageName,
    onImageLoaded,
    processImage,
}) => (
    <Box className={styles.left}>
        <PortraitDropper
            imageURL={imageURL}
            name={imageName}
            onImageLoaded={onImageLoaded}
            onComplete={processImage}
        />
    </Box>
);