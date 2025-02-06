import { Box, createTheme, TextField, Theme, ThemeProvider, Typography } from "@mui/material";
import styles from './createstoryslideshow.module.css';
import { ChangeEvent } from "react";

interface DescriptionStepProps {
    text: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    theme: Theme
}

function randomSummary(): string {
    const settings = [
        "In a bustling medieval kingdom",
        "In a dystopian future city",
        "In the quiet suburbs of a small town",
        "Amid the floating islands of a forgotten realm",
        "Deep within an ancient desert temple"
    ];

    const characters = [
        "a young orphan with a mysterious past",
        "an aging detective haunted by old regrets",
        "a resourceful thief desperate for redemption",
        "a brilliant scholar seeking forbidden knowledge",
        "a reluctant hero burdened by prophecy"
    ];

    const plots = [
        "uncovers a hidden relic with unimaginable power",
        "stumbles upon a sinister conspiracy that threatens all life",
        "awakens an ancient evil sealed away for centuries",
        "forges an uneasy alliance with a sworn enemy",
        "becomes the key witness to a cosmic event no one understands"
    ];

    const conflicts = [
        "As dark forces gather on the horizon, the fate of the realm hangs in the balance",
        "With danger closing in, they must confront their own fears to protect what they hold dear",
        "Hunted by ruthless adversaries, they embark on a perilous journey to preserve hope",
        "With time running out, they risk everything to uncover the truth",
        "Caught between loyalty and survival, they race against destiny"
    ];

    const conclusions = [
        "only unity and sacrifice can bring peace once more",
        "their courage alone may not be enough to save everyone",
        "an unimaginable sacrifice could be the world’s last chance",
        "one fateful choice will decide their destiny",
        "the final showdown will test their resolve—and their humanity"
    ];

    // Helper to pick a random item from an array
    const pick = (arr: string[]) =>
        arr[Math.floor(Math.random() * arr.length)];

    const setting = pick(settings);
    const character = pick(characters);
    const plot = pick(plots);
    const conflict = pick(conflicts);
    const conclusion = pick(conclusions);

    // Combine into 2 or 3 sentences (here we'll do 2 for brevity):
    return `${setting}, ${character} ${plot}. ${conflict}, and ${conclusion}.`;
}
const defaultText = randomSummary();


export const DescriptionStep = (props: DescriptionStepProps) => {


    return (
        <ThemeProvider theme={props.theme}>
            <Box className={styles.formContainer}>
                <Typography sx={{ mb: 2 }}>Enter a brief description of your story</Typography>
                <TextField inputProps={{
                }} minRows={4} maxRows={10} multiline sx={{ width: '300px', padding: '0' }} placeholder={defaultText} value={props.text || ""} onChange={props.onChange} />
            </Box>
        </ThemeProvider>
    );
}