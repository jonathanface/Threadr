import { TextField } from "@mui/material";
import React, { useEffect, useState } from "react";

interface EditableTextProps {
  textValue: string;
  onTextChange: (event: React.SyntheticEvent<Element, Event>) => void;
}
export const EditableText = (props: EditableTextProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState("");

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
    <span onClick={onDblClick}>
      {!isEditing ? (
        textValue
      ) : (
        <TextField
          autoFocus
          inputProps={{
            style: {
              display: "inline",
              color: "#FFF",
              padding: "10px",
              textAlign: "center",
              fontSize: "1rem",
              border: "none",
            },
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
