import {
  Card,
  CardHeader,
  CardContent,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Box,
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";

import { ClickData } from "../../../plugins/DocumentClickPlugin";
import { LightTextEditor } from "../../../../LightTextEditor";
import DOMPurify from "dompurify";
import { useState } from "react";

export type BackstoryCardProps = {
  onAssociationClick: (data: ClickData) => void;
  onBackstoryEdit: (text: string) => void;
  text: string;
};

export const BackstoryCard = ({
  onBackstoryEdit,
  text,
}: BackstoryCardProps) => {
  console.log("bstory", text);
  const [notes, setNotes] = useState(text || "");
  const [editing, setEditing] = useState(false);

  return (
    <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
      <CardHeader
        title={
          <Typography
            variant="h6"
            noWrap
            sx={{ cursor: "text", maxWidth: "40ch" }}
          >
            Backstory
          </Typography>
        }
        action={
          <Tooltip title={editing ? "Finish notes" : "Edit notes"}>
            <IconButton
              onClick={() => {
                if (editing) {
                  onBackstoryEdit(notes);
                }
                setEditing(!editing);
              }}
              aria-label="toggle notes edit"
            >
              <EditNoteIcon />
            </IconButton>
          </Tooltip>
        }
        sx={{ pb: 0.5 }}
      />

      <CardContent sx={{ pt: 1.5, ml: "8px" }}>
        {/* Notes */}
        {editing ? (
          <LightTextEditor text={notes} onChange={(value) => setNotes(value)} />
        ) : !text ? (
          <Typography
            component="div" // render as <div>, avoids <p><p> nesting
            sx={{ fontSize: "0.8em", m: "0.5em", color: "text.secondary" }}
          >
            — No backstory yet —
          </Typography>
        ) : (
          <Box
            component="div" // explicit block wrapper for injected HTML
            sx={{
              m: "0.5em",
              fontSize: "0.9rem",
              whiteSpace: "pre-wrap", // HTML will include <p>/<br>; no need for pre-wrap
              "& ul, & ol": { pl: 3, my: 0.5 },
              "& p": { m: 0, mb: 0.5 },
            }}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(text, {
                ALLOWED_TAGS: [
                  "b",
                  "strong",
                  "i",
                  "em",
                  "u",
                  "ul",
                  "ol",
                  "li",
                  "br",
                  "p",
                  "div",
                  "span",
                ],
                ALLOWED_ATTR: [],
              }),
            }}
          />
        )}
        <Divider sx={{ my: 1.5 }} />
      </CardContent>
    </Card>
  );
};
