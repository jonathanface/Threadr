import { Box, Typography } from "@mui/material";
import styles from './createeditstoryslideshow.module.css';

interface VerificationStepProps {
    onBack: () => void;
    onReset: () => void;
    isEditing?: boolean;
}

export const VerificationStep = (props: VerificationStepProps) => {
    return (
        <Box className={styles.formContainer}>
            <Typography sx={{ mt: 2, mb: 1 }}>
                {
                    "If everything on the left looks correct, you can now click finish to " +
                    (props.isEditing ? "update your story. " : "create your new story. ") +
                    "Otherwise, go back and make changes."
                }
            </Typography>


        </Box>
    );
}