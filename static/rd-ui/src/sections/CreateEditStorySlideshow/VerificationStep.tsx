import { Box, Typography } from "@mui/material";
import styles from './createeditstoryslideshow.module.css';
import { CreateStoryForm } from ".";

interface VerificationStepProps {
    onBack: () => void;
    onReset: () => void;
    isEditing?: boolean;
    isMobile: boolean;
    storyBuild?: CreateStoryForm;
    tempImageURL?: string;
}

export const VerificationStep = (props: VerificationStepProps) => {
    const storyBuild = props.storyBuild;
    if (!storyBuild) return
    return (
        <Box className={styles.formContainer}>
            <Typography sx={{ mt: 2, mb: 1 }}>
                {
                    "If everything " +
                    (!props.isMobile ? "on the left " : "below ") +
                    "looks correct, you can now click finish to " +
                    (props.isEditing ? "update your story. " : "create your new story. ") +
                    "Otherwise, go back and make changes."
                }
            </Typography>
            <Box className={styles.finalProductMobile}>
                <Typography variant="subtitle1" className={`${styles.finalTitle} ${storyBuild.title} ${styles.hasText}`}>{`${storyBuild.title}`}</Typography>
                <img className={`${styles.finalImage} ${storyBuild.image} ${styles.hasText}`} src={props.tempImageURL} />
                <Typography variant="body2" className={`${styles.finalDescription} ${styles.hasText}`}>{storyBuild.description}</Typography>
                <Typography variant="body2" className={`${styles.finalSeries} ${storyBuild.series_id && storyBuild.series_id.trim().length > 0 ? styles.hasText : ''}`}><b>Series: </b>{storyBuild.series_title}</Typography>
            </Box>
        </Box>
    );
}