import ArticleOutlinedIcon from "@mui/icons-material/Article";
import CloseIcon from "@mui/icons-material/Close";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { IconButton, ListItemIcon, ListItemText, MenuItem as MaterialMenuItem, TextField } from "@mui/material";
import React, { ChangeEvent, forwardRef, useImperativeHandle, useState } from "react";
import { useDispatch } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { setIsSubscriptionFormOpen } from "../../stores/uiSlice";
import { DocumentExportType, Story } from "../../types";
import { AlertToastType } from "../../utils/Toaster";
import Exporter from "./Exporter";

import styles from "./document-toolbar.module.css";

import { faAlignCenter, faAlignJustify, faAlignLeft, faAlignRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AppDispatch } from "../../stores/store";

interface DocumentToolbarProps {
  story?: Story;
  exitFunction: Function;
  updateAlignment: Function;
  updateStyle: Function;
  updateSpellcheck: Function;
}

export enum BlockAlignmentType {
  left = "left",
  right = "right",
  center = "center",
  justify = "justify",
}

export enum TextFormatType {
  bold = "bold",
  italic = "italic",
  underscore = "underscore",
  strikethrough = "strikethrough",
}

interface DocumentFormatting {
  bold: boolean;
  italic: boolean;
  underscore: boolean;
  strikethrough: boolean;
  alignment: BlockAlignmentType;
}

const defaultFormatting: DocumentFormatting = {
  bold: false,
  italic: false,
  underscore: false,
  strikethrough: false,
  alignment: BlockAlignmentType.left,
};

export interface DocumentToolbarRef {
  resetNavButtons: () => void;
  updateNavButtons: (style: string, value: boolean | string) => void;
  getCurrentBlockAlignment: () => string;
}

const DocumentToolbar = forwardRef((props: DocumentToolbarProps, ref) => {
  const useAppDispatch: () => AppDispatch = useDispatch;
  const dispatch = useAppDispatch();

  const [currentFormatting, setCurrentFormatting] = useState(defaultFormatting);
  const [exportMenuValue, setExportMenuValue] = React.useState(false);

  useImperativeHandle(ref, () => ({
    resetNavButtons() {
      setCurrentFormatting(defaultFormatting);
    },
    updateNavButtons(style: string, value: boolean | string) {
      setNavButtonState(style, value);
    },
    getCurrentBlockAlignment() {
      return currentFormatting.alignment as string;
    },
  }));

  const setNavButtonState = (style: string, value: boolean | string) => {
    switch (style) {
      case TextFormatType.bold: {
        console.log("set bold to", value);
        setCurrentFormatting((prevState) => ({
          ...prevState,
          bold: value as boolean,
        }));
        break;
      }
      case TextFormatType.italic: {
        setCurrentFormatting((prevState) => ({
          ...prevState,
          italic: value as boolean,
        }));
        break;
      }
      case TextFormatType.underscore: {
        setCurrentFormatting((prevState) => ({
          ...prevState,
          underscore: value as boolean,
        }));
        break;
      }
      case TextFormatType.strikethrough: {
        setCurrentFormatting((prevState) => ({
          ...prevState,
          strikethrough: value as boolean,
        }));
        break;
      }
      case "alignment": {
        setCurrentBlockAlignment(value as BlockAlignmentType);
        setCurrentFormatting((prevState) => ({
          ...prevState,
          alignment: value as BlockAlignmentType,
        }));
        break;
      }
      default:
    }
  };

  const [currentBlockAlignment, setCurrentBlockAlignment] = useState(BlockAlignmentType.left);

  const exportDoc = async (type: DocumentExportType) => {
    if (props.story) {
      const newAlert = {
        title: "Conversion in progress",
        message: "A download link will be provided when the process is complete.",
        open: true,
        severity: AlertToastType.info,
      };
      dispatch(setAlert(newAlert));
      const exp = new Exporter(props.story.story_id);
      const htmlData = await exp.DocToHTML();
      try {
        const response = await fetch("/api/stories/" + props.story.story_id + "/export", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            story_id: props.story.story_id,
            html_by_chapter: htmlData,
            type: type,
            title: props.story.title,
          }),
        });
        if (!response.ok) {
          if (response.status === 401) {
            const alertFunction = {
              func: () => {
                setIsSubscriptionFormOpen(true);
              },
              text: "subscribe",
            };
            const newAlert = {
              title: "Insufficient subscription",
              message: "Free accounts are unable to export their stories.",
              open: true,
              severity: AlertToastType.warning,
              timeout: 6000,
              func: alertFunction,
            };
            dispatch(setAlert(newAlert));
            return;
          } else {
            throw new Error("Fetch problem export " + response.status);
          }
        }
        const json = await response.json();

        const alertLink = {
          url: json.url,
          text: "download/open",
        };
        const newAlert = {
          title: "Conversion complete",
          message: "Click the link to access.",
          open: true,
          severity: AlertToastType.success,
          link: alertLink,
          timeout: undefined,
        };
        dispatch(setAlert(newAlert));
      } catch (error) {
        console.error(error);
        const errorAlert = {
          title: "Error",
          message:
            "Unable to export your document at this time. Please try again later, or contact support@richdocter.io.",
          open: true,
          severity: AlertToastType.error,
        };
        dispatch(setAlert(errorAlert));
      }
    }
  };

  const toggleSpellcheck = (event: ChangeEvent) => {
    const target = event.target as HTMLInputElement;
    props.updateSpellcheck(target.checked);
  };

  return (
    <nav className={styles.richControls}>
      <div>
        <span className={styles.controlsRow}>
          <button
            className={currentFormatting.bold ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState(TextFormatType.bold, !currentFormatting.bold);
              props.updateStyle(e, TextFormatType.bold);
            }}>
            <b>B</b>
          </button>
          <button
            className={currentFormatting.italic ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState(TextFormatType.italic, !currentFormatting.italic);
              props.updateStyle(e, TextFormatType.italic);
            }}>
            <i>I</i>
          </button>
          <button
            className={currentFormatting.underscore ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState(TextFormatType.underscore, !currentFormatting.underscore);
              props.updateStyle(e, TextFormatType.underscore);
            }}>
            <u>U</u>
          </button>
          <button
            className={currentFormatting.strikethrough ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState(TextFormatType.strikethrough, !currentFormatting.strikethrough);
              props.updateStyle(e, TextFormatType.strikethrough);
            }}>
            <s>S</s>
          </button>
        </span>
        <span className={styles.controlsRow}>
          <button
            className={currentBlockAlignment === BlockAlignmentType.left ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState("alignment", BlockAlignmentType.left);
              props.updateAlignment(BlockAlignmentType.left);
            }}>
            <FontAwesomeIcon icon={faAlignLeft} />
          </button>
          <button
            className={currentBlockAlignment === BlockAlignmentType.center ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState("alignment", BlockAlignmentType.center);
              props.updateAlignment(BlockAlignmentType.center);
            }}>
            <FontAwesomeIcon icon={faAlignCenter} />
          </button>
          <button
            className={currentBlockAlignment === BlockAlignmentType.right ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState("alignment", BlockAlignmentType.right);
              props.updateAlignment(BlockAlignmentType.right);
            }}>
            <FontAwesomeIcon icon={faAlignRight} />
          </button>
          <button
            className={currentBlockAlignment === BlockAlignmentType.justify ? styles.active : ""}
            onMouseDown={(e) => {
              setNavButtonState("alignment", BlockAlignmentType.justify);
              props.updateAlignment(BlockAlignmentType.justify);
            }}>
            <FontAwesomeIcon icon={faAlignJustify} />
          </button>
        </span>
        <span className={styles.rightControls}>
          <span>
            <label>
              Spellcheck
              <input type="checkbox" defaultChecked={true} onChange={toggleSpellcheck} />
            </label>
          </span>
          <span>
            <TextField
              select
              label="Save as..."
              InputLabelProps={{
                style: { color: "#f0f0f0" },
              }}
              SelectProps={{
                value: "",
                onChange: (evt) => {
                  setExportMenuValue(!exportMenuValue);
                },
                onClose: (evt) => {
                  //   setTimeout(() => {
                  //     document.activeElement.blur();
                  //   }, 0);
                },
              }}
              size="small"
              sx={{
                width: "120px",
              }}>
              <MaterialMenuItem
                value="docx"
                onClick={() => {
                  exportDoc(DocumentExportType.docx);
                }}>
                <ListItemIcon>
                  <ArticleOutlinedIcon />
                </ListItemIcon>
                <ListItemText primary="DOCX" />
              </MaterialMenuItem>
              <MaterialMenuItem
                value="pdf"
                onClick={(e) => {
                  exportDoc(DocumentExportType.pdf);
                }}>
                <ListItemIcon>
                  <PictureAsPdfIcon />
                </ListItemIcon>
                <ListItemText primary="PDF" />
              </MaterialMenuItem>
            </TextField>
            <span className={styles.closeDocButton}>
              <IconButton aria-label="exit" component="label" onClick={() => props.exitFunction()}>
                <CloseIcon
                  sx={{
                    color: "#F0F0F0",
                  }}
                />
              </IconButton>
            </span>
          </span>
        </span>
      </div>
    </nav>
  );
});

export default DocumentToolbar;
