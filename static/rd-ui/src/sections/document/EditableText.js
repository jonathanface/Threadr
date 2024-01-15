import { TextField } from "@mui/material";
import React, { useEffect, useState } from "react";

const EditableText = (props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState("");

  useEffect(() => {
    setTextValue(props.textValue);
  }, [props.textValue]);

  const onDblClick = (event) => {
    if (event.detail >= 2) {
      setIsEditing(true);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      onBlur(event);
    }
  };

  const onBlur = (event) => {
    setIsEditing(false);
    props.onTextChange(event);
    setTextValue(event.currentTarget.textContent);
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
export default EditableText;
