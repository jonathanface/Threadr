import { TextField } from "@mui/material";
import React, { useEffect, useState } from "react";
import styles from './editabletext.module.css';

interface EditableTextProps {
    textValue: string;
    onTextChange: (event: React.SyntheticEvent) => Promise<void>;
    inputTextAlign?: string;
}
export const EditableText = (props: EditableTextProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [textValue, setTextValue] = useState("");
    const inputAlignment = props.inputTextAlign ? props.inputTextAlign : 'left';

    useEffect(() => {
        setTextValue(props.textValue);
    }, [props.textValue]);

    const onDblClick = (event: React.MouseEvent) => {
        if (event.detail >= 2) {
            setIsEditing(true);
        }
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
            onBlur(event);
        }
    };

    const onBlur = (event: React.SyntheticEvent) => {
        setIsEditing(false);
        props.onTextChange(event);
        const target = event.target as HTMLInputElement;
        const text = target.value;
        if (text) {
            setTextValue(text);
        }
    };

    return (
        <span className={styles.editableParent} onClick={onDblClick}>
            {!isEditing ? (
                textValue
            ) : (
                <TextField
                    className={styles.editField}
                    autoFocus
                    slotProps={{
                        htmlInput:
                        {
                            style: {
                                textAlign: inputAlignment,
                            }
                        }
                    }}
                    sx={{
                        "& fieldset": { border: "none" },
                    }}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    defaultValue={textValue}
                />
            )}
        </span>
    );
};