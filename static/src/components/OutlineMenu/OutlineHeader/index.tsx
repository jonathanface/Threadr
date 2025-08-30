import { Box, TextField, MenuItem, Button, Tooltip } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
/** TO DO  */
type OutlineTemplateId =
  | "freeform"
  | "three_act"
  | "five_act"
  | "heros_journey"
  | `custom:${string}`;

const TEMPLATE_OPTIONS: Array<{ id: OutlineTemplateId; label: string }> = [
  { id: "three_act", label: "3-Act" },
  { id: "five_act", label: "5-Act (Freytag)" },
  { id: "heros_journey", label: "Hero’s Journey" },
  { id: "freeform", label: "Freeform" },
  // include user's saved custom schemas if any:
  // { id: "custom:abc123", label: "My Thriller Template" },
];

export const OutlineHeader = ({
  value, // current template id, e.g. "five_act"
  onChangeTemplate, // (nextId: OutlineTemplateId) => void
  onCustomize, // () => void (opens schema editor)
  disabled,
}: {
  value: OutlineTemplateId;
  onChangeTemplate: (next: OutlineTemplateId) => void;
  onCustomize?: () => void;
  disabled?: boolean;
}) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
      <TextField
        label="Outline template"
        select
        size="small"
        value={value}
        onChange={(e) => onChangeTemplate(e.target.value as OutlineTemplateId)}
        sx={{ minWidth: 220 }}
        InputLabelProps={{ sx: { fontSize: 14 } }}
        SelectProps={{ sx: { fontSize: 14 } }}
        disabled={disabled}
      >
        {TEMPLATE_OPTIONS.map((opt) => (
          <MenuItem key={opt.id} value={opt.id}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {onCustomize && (
        <Tooltip title="Edit stages (add/rename/reorder/colors)">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<TuneIcon />}
              onClick={onCustomize}
              disabled={disabled}
            >
              Customize
            </Button>
          </span>
        </Tooltip>
      )}
    </Box>
  );
};
