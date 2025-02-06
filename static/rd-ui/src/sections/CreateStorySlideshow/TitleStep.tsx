import { Box, TextField, Theme, ThemeProvider, Typography } from "@mui/material";
import styles from './createstoryslideshow.module.css';
import { ChangeEvent } from "react";

interface TitleStepProps {
    title?: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    theme: Theme;
}

const randomBookTitle = () => {
    console.log("gening")
    const vowels = ["A", "E", "I", "O", "U"];
    const articles = ["The", "A", "An"];
    const adjectives = [
        "Lost",
        "Secret",
        "Mystical",
        "Enchanted",
        "Forgotten",
        "Ancient",
        "Dark",
        "Whispering",
        "Infinite",
        "Hidden"
    ];
    const nouns = [
        "Kingdom",
        "Journey",
        "Legacy",
        "Forest",
        "Empire",
        "Prophecy",
        "Shadow",
        "Adventure",
        "Myth",
        "Chronicle"
    ];

    // Pick a random adjective first.
    const adjective =
        adjectives[Math.floor(Math.random() * adjectives.length)];

    // Pick a random article.
    let article = articles[Math.floor(Math.random() * articles.length)];

    // Adjust the article based on the first letter of the adjective.
    const firstLetter = adjective.charAt(0).toUpperCase();
    if (article === "An" && !vowels.includes(firstLetter)) {
        article = "A";
    } else if (article === "A" && vowels.includes(firstLetter)) {
        article = "An";
    }

    // Pick a random noun.
    const noun = nouns[Math.floor(Math.random() * nouns.length)];

    return `${article} ${adjective} ${noun}`;
}
const defaultText = randomBookTitle();

export const TitleStep = (props: TitleStepProps) => {

    return (
        <ThemeProvider theme={props.theme}>
            <Box className={styles.formContainer}>
                <Typography sx={{ mb: 2 }}>Let's start with a title. Make it a good one.</Typography>
                <TextField sx={{ minWidth: '200px', width: '50%' }} placeholder={defaultText} value={props.title || ""} onChange={props.onChange} />
            </Box>
        </ThemeProvider>
    )
}