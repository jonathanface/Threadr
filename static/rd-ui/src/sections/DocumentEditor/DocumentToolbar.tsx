import ArticleOutlinedIcon from "@mui/icons-material/Article";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardDoubleArrowDownIcon from "@mui/icons-material/KeyboardDoubleArrowDown";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import {
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem as MaterialMenuItem,
  TextField,
} from "@mui/material";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import React, {
  ChangeEvent,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { useDispatch } from "react-redux";
import { setAlert } from "../../stores/alertSlice";
import { BlockAlignmentType, TextFormatType } from "../../types/Document";
import { Exporter } from "./Exporter";
import styles from "./document-toolbar.module.css";

import {
  faAlignCenter,
  faAlignJustify,
  faAlignLeft,
  faAlignRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AppDispatch } from "../../stores/store";
import {
  AlertCommandType,
  AlertFunctionCall,
  AlertToastType,
} from "../../types/AlertToasts";
import { DocumentExportType } from "../../types/DocumentExport";
import { Story } from "../../types/Story";

interface DocumentToolbarProps {
  story?: Story;
  chapterID: string;
  exitFunction: Function;
  updateAlignment: Function;
  updateStyle: Function;
  updateSpellcheck: Function;
  updateFont: Function;
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

export const DocumentToolbar = forwardRef(
  (props: DocumentToolbarProps, ref) => {
    const [isMenuExpanded, setIsMenuExpanded] = useState(false);
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const toggleMenuExpand = () => {
      setIsMenuExpanded(!isMenuExpanded);
    };

    const analyzeChapter = async (typeOf: string) => {
      if (!props.story) {
        return;
      }
      const newAlert = {
        title: "Analyzing...",
        message:
          "Your chapter has been submitted for analysis. Awaiting response.",
        open: true,
        severity: AlertToastType.info,
        timeout: undefined,
      };
      dispatch(setAlert(newAlert));
      try {
        const response = await fetch(
          "/api/stories/" +
            props.story.story_id +
            "/chapter/" +
            props.chapterID +
            "/analyze/" +
            typeOf,
          {
            credentials: "include",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        if (!response.ok) {
          if (response.status === 401) {
            const subscribeFunc: AlertFunctionCall = {
              type: AlertCommandType.subscribe,
              text: "subscribe",
            };
            const newAlert = {
              title: "Insufficient subscription",
              message: "Free accounts are unable to use AI assistance.",
              open: true,
              severity: AlertToastType.warning,
              timeout: 6000,
              func: subscribeFunc,
            };
            dispatch(setAlert(newAlert));
            return;
          } else {
            throw new Error("Fetch problem export " + response.status);
          }
        }
        const json = await response.json();
        const newAlert = {
          title: "Analysis",
          message: json.content,
          open: true,
          severity: AlertToastType.success,
          timeout: undefined,
        };
        dispatch(setAlert(newAlert));
      } catch (error: any) {
        console.error(error);
        const newAlert = {
          title: "Problem contacting the Docter",
          message:
            "We are unable to analyze your chapter at this time. Please try again later.",
          open: true,
          severity: AlertToastType.error,
          timeout: 6000,
        };
        dispatch(setAlert(newAlert));
      }
    };

    const useAppDispatch: () => AppDispatch = useDispatch;
    const dispatch = useAppDispatch();

    const [currentFormatting, setCurrentFormatting] =
      useState(defaultFormatting);
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

    const [currentBlockAlignment, setCurrentBlockAlignment] = useState(
      BlockAlignmentType.left
    );

    const exportDoc = async (type: DocumentExportType) => {
      if (props.story) {
        const newAlert = {
          title: "Conversion in progress",
          message:
            "A download link will be provided when the process is complete.",
          open: true,
          severity: AlertToastType.info,
        };
        dispatch(setAlert(newAlert));
        const exp = new Exporter(props.story.story_id);
        const htmlData = await exp.DocToHTML();
        try {
          const response = await fetch(
            "/api/stories/" + props.story.story_id + "/export?type=" + type,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                html_by_chapter: htmlData,
                title: props.story.title,
              }),
            }
          );
          if (!response.ok) {
            if (response.status === 401) {
              const subscribeFunc: AlertFunctionCall = {
                type: AlertCommandType.subscribe,
                text: "subscribe",
              };
              const newAlert = {
                title: "Insufficient subscription",
                message: "Free accounts are unable to export their stories.",
                open: true,
                severity: AlertToastType.warning,
                timeout: 6000,
                func: subscribeFunc,
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
            message: "Right-click the link to save your document.",
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

    const handleDocterButtonClick = (
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      setAnchorEl(event.currentTarget);
    };

    const handleDocterMenuClose = (_event: MouseEvent) => {
      setAnchorEl(null);
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
              }}
            >
              <b>B</b>
            </button>
            <button
              className={currentFormatting.italic ? styles.active : ""}
              onMouseDown={(e) => {
                setNavButtonState(
                  TextFormatType.italic,
                  !currentFormatting.italic
                );
                props.updateStyle(e, TextFormatType.italic);
              }}
            >
              <i>I</i>
            </button>
            <button
              className={currentFormatting.underscore ? styles.active : ""}
              onMouseDown={(e) => {
                setNavButtonState(
                  TextFormatType.underscore,
                  !currentFormatting.underscore
                );
                props.updateStyle(e, TextFormatType.underscore);
              }}
            >
              <u>U</u>
            </button>
            <button
              className={currentFormatting.strikethrough ? styles.active : ""}
              onMouseDown={(e) => {
                setNavButtonState(
                  TextFormatType.strikethrough,
                  !currentFormatting.strikethrough
                );
                props.updateStyle(e, TextFormatType.strikethrough);
              }}
            >
              <s>S</s>
            </button>
          </span>
          <span className={styles.controlsRow}>
            <button
              className={
                currentBlockAlignment === BlockAlignmentType.left
                  ? styles.active
                  : ""
              }
              onMouseDown={(_e) => {
                setNavButtonState("alignment", BlockAlignmentType.left);
                props.updateAlignment(BlockAlignmentType.left);
              }}
            >
              <FontAwesomeIcon icon={faAlignLeft} />
            </button>
            <button
              className={
                currentBlockAlignment === BlockAlignmentType.center
                  ? styles.active
                  : ""
              }
              onMouseDown={(_e) => {
                setNavButtonState("alignment", BlockAlignmentType.center);
                props.updateAlignment(BlockAlignmentType.center);
              }}
            >
              <FontAwesomeIcon icon={faAlignCenter} />
            </button>
            <button
              className={
                currentBlockAlignment === BlockAlignmentType.right
                  ? styles.active
                  : ""
              }
              onMouseDown={(_e) => {
                setNavButtonState("alignment", BlockAlignmentType.right);
                props.updateAlignment(BlockAlignmentType.right);
              }}
            >
              <FontAwesomeIcon icon={faAlignRight} />
            </button>
            <button
              className={
                currentBlockAlignment === BlockAlignmentType.justify
                  ? styles.active
                  : ""
              }
              onMouseDown={(_e) => {
                setNavButtonState("alignment", BlockAlignmentType.justify);
                props.updateAlignment(BlockAlignmentType.justify);
              }}
            >
              <FontAwesomeIcon icon={faAlignJustify} />
            </button>
          </span>
          <span className={styles.rightControls}>
            <IconButton
              aria-label="expand"
              title="More"
              component="label"
              onClick={toggleMenuExpand}
            >
              {!isMenuExpanded ? (
                <KeyboardDoubleArrowLeftIcon
                  sx={{
                    color: "#F0F0F0",
                  }}
                />
              ) : (
                <KeyboardDoubleArrowDownIcon
                  sx={{
                    color: "#F0F0F0",
                  }}
                />
              )}
            </IconButton>
            <span className={styles.closeDocButton}>
              <IconButton
                aria-label="exit"
                component="label"
                onClick={() => props.exitFunction()}
              >
                <CloseIcon
                  sx={{
                    color: "#F0F0F0",
                  }}
                />
              </IconButton>
            </span>
          </span>
        </div>
        <div
          className={`${styles.hiddenControlsRow} ${
            isMenuExpanded ? styles.active : ""
          }`}
        >
          <span>
            <Menu
              id="basic-menu"
              anchorEl={anchorEl}
              open={open}
              onClose={handleDocterMenuClose}
              MenuListProps={{
                "aria-labelledby": "basic-button",
              }}
            >
              <MenuItem
                onClick={() => {
                  analyzeChapter("analyze");
                }}
              >
                Analyze Chapter
              </MenuItem>
              <MenuItem
                onClick={() => {
                  analyzeChapter("propose");
                }}
              >
                What Next?
              </MenuItem>
            </Menu>
            <Button
              id="basic-button"
              aria-controls={open ? "basic-menu" : undefined}
              aria-haspopup="true"
              aria-expanded={open ? "true" : undefined}
              onClick={handleDocterButtonClick}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 16 16"
                id="doctor"
              >
                <path
                  fill="#FFF"
                  d="M14 11.3c-1-1.9-2-1.6-3.1-1.7.1.3.1.6.1 1 1.6.4 2 2.3 2 3.4v1h-2v-1h1s0-2.5-1.5-2.5S9 13.9 9 14h1v1H8v-1c0-1.1.4-3.1 2-3.4 0-.6-.1-1.1-.2-1.3-.2-.1-.4-.3-.4-.6 0-.6.8-.4 1.4-1.5 0 0 .9-2.3.6-4.3h-1c0-.2.1-.3.1-.5s0-.3-.1-.5h.8C10.9.9 9.9 0 8 0 6.1 0 5.1.9 4.7 2h.8c0 .2-.1.3-.1.5s0 .3.1.5h-1c-.2 2 .6 4.3.6 4.3.6 1 1.4.8 1.4 1.5 0 .5-.5.7-1.1.8-.2.2-.4.6-.4 1.4v1.2c.6.2 1 .8 1 1.4 0 .7-.7 1.4-1.5 1.4S3 14.3 3 13.5c0-.7.4-1.2 1-1.4v-1.2c0-.5.1-.9.2-1.3-.7.1-1.5.4-2.2 1.7-.6 1.1-.9 4.7-.9 4.7h13.7c.1 0-.2-3.6-.8-4.7zM6.5 2.5C6.5 1.7 7.2 1 8 1s1.5.7 1.5 1.5S8.8 4 8 4s-1.5-.7-1.5-1.5z"
                ></path>
                <path
                  fill="#FFF"
                  d="M5 13.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z"
                ></path>
              </svg>
            </Button>
          </span>
          <span>
            <label title="Toggle Spellcheck">
              Spellcheck
              <input
                type="checkbox"
                defaultChecked={true}
                onChange={toggleSpellcheck}
              />
            </label>
          </span>
          <span className={styles.rightControls}>
            <TextField
              title="Font"
              select
              label="Font"
              InputLabelProps={{
                style: { color: "#f0f0f0" },
              }}
              SelectProps={{
                value: "",
                onChange: (_evt) => {
                  setExportMenuValue(!exportMenuValue);
                },
                onClose: (_evt) => {
                  //   setTimeout(() => {
                  //     document.activeElement.blur();
                  //   }, 0);
                },
              }}
              size="small"
              sx={{
                width: "120px",
              }}
            >
              <MaterialMenuItem
                value="Arial"
                onClick={() => {
                  props.updateFont("inherit");
                }}
              >
                <ListItemText primary="Arial" />
              </MaterialMenuItem>
              <MaterialMenuItem
                value="Times New Roman"
                onClick={(_e) => {
                  props.updateFont("Times New Roman");
                }}
              >
                <ListItemText primary="Times New Roman" />
              </MaterialMenuItem>
            </TextField>
            <TextField
              title="Export to File"
              select
              label="Save as..."
              InputLabelProps={{
                style: { color: "#f0f0f0" },
              }}
              SelectProps={{
                value: "",
                onChange: (_evt) => {
                  setExportMenuValue(!exportMenuValue);
                },
                onClose: (_evt) => {
                  //   setTimeout(() => {
                  //     document.activeElement.blur();
                  //   }, 0);
                },
              }}
              size="small"
              sx={{
                width: "120px",
              }}
            >
              <MaterialMenuItem
                value="docx"
                onClick={() => {
                  exportDoc(DocumentExportType.docx);
                }}
              >
                <ListItemIcon>
                  <ArticleOutlinedIcon />
                </ListItemIcon>
                <ListItemText primary="DOCX" />
              </MaterialMenuItem>
              <MaterialMenuItem
                value="pdf"
                onClick={(_e) => {
                  exportDoc(DocumentExportType.pdf);
                }}
              >
                <ListItemIcon>
                  <PictureAsPdfIcon />
                </ListItemIcon>
                <ListItemText primary="PDF" />
              </MaterialMenuItem>
            </TextField>
          </span>
        </div>
      </nav>
    );
  }
);
