import { Box, Button, Typography } from "@mui/material";
import styles from './createstoryslideshow.module.css';

interface VerificationStepProps {
    onBack: () => void;
    onReset: () => void;
}

export const VerificationStep = (props: VerificationStepProps) => {
    return (
        <Box className={styles.formContainer}>
            <Typography sx={{ mt: 2, mb: 1 }}>
                If everything on the left looks correct, you can now click finish to create your new story. Otherwise, go back and make changes.
            </Typography>

        </Box>
    );
}