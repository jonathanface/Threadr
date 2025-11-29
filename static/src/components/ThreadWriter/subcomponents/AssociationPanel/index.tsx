import {
  Box,
  CircularProgress,
  Drawer,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Association } from "../../../../types/Associations";
import styles from "./association-ui.module.css";
import { PortraitDropper } from "../../../PortraitDropper";
import { FC, useEffect, useRef, useState } from "react";
import { useSelections } from "../../../../hooks/useSelections";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AssociationDecoratorPlugin } from "../../plugins/AssociationDecoratorPlugin";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  EditorState,
  LexicalEditor,
} from "lexical";
import { ClickData } from "../../plugins/DocumentClickPlugin";
import { CharacterLimitPlugin } from "@lexical/react/LexicalCharacterLimitPlugin";
import { OverflowNode } from "@lexical/overflow";
import { TextTransformPlugin } from "../../plugins/TextTransformPlugin";
import { AssociationInlineNode } from "../../customNodes/AssociationInlineNode";
import { InfoHover } from "../../../InfoHover";
import { api } from "../../../../api";
import axios from "axios";

interface AssociationProps {
  onEditCallback: (association: Association) => void;
  isAssociationPanelOpen: boolean;
  setIsAssociationPanelOpen: (is: boolean) => void;
  selectedAssociationID: string | null;
}
const theme = {
  paragraph: styles.paragraph,
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
  },
};
const descriptionConfig = {
  namespace: "DescriptionEditor",
  theme,
  nodes: [AssociationInlineNode, OverflowNode],
  onError: (error: Error) => {
    console.error("descr error:", error);
  },
};
const bgConfig = {
  namespace: "BackgroundEditor",
  theme,
  nodes: [AssociationInlineNode],
  onError: (error: Error) => {
    console.error("BG error:", error);
  },
};

export const AssociationPanel: FC<AssociationProps> = (props) => {
  const defaultImageURL = useRef("/img/default_association_portrait.jpg");
  const [selectedAssociation, setSelectedAssociation] =
    useState<Association | null>(null);
  const [isAssociationLoaderVisible, setIsAssociationLoaderVisible] =
    useState(true);
  const bgEditorRef = useRef<LexicalEditor>(null);
  const descriptionEditorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const initialAssociation = useRef<Association | null>(null);
  const exclusionList = useRef<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [aliases, setAliases] = useState("");
  const [name, setName] = useState("");
  const [isDescriptionActive, setIsDescriptionActive] = useState(false);
  const [isBackgroundActive, setIsBackgroundActive] = useState(false);
  const [isAliasesActive, setIsAliasesActive] = useState(false);
  const [isNameActive, setIsNameActive] = useState(false);
  const [aliasesError, setAliasesError] = useState("");
  const [selectedAssociationID, setSelectedAssociationID] = useState(
    props.selectedAssociationID,
  );
  const { story, chapter } = useSelections();

  const clearData = () => {
    initialAssociation.current = null;
    setSelectedAssociation(null);
    setSelectedAssociationID(null);
    setAliases("");
    setName("");
    bgEditorRef.current?.update(() => {
      $getRoot().clear();
    });
    descriptionEditorRef.current?.update(() => {
      $getRoot().clear();
    });
  };

  const updateAliases = (newAliases: string) => {
    if (!selectedAssociation) return;
    setAliasesError("");
    const aliasesArray = newAliases.split(",");
    // don't proceed if there are duplicates
    const errMsg =
      "Aliases cannot contain the original name or any duplicates.";
    if (aliasesArray.includes(selectedAssociation.association_name)) {
      setAliasesError(errMsg);
      return;
    }
    if (aliasesArray.length !== new Set(aliasesArray).size) {
      setAliasesError(errMsg);
      return;
    }
    setAliases(newAliases);
  };

  useEffect(() => {
    const fetchAssociationDetails = async () => {
      if (props.selectedAssociationID)
        setSelectedAssociationID(props.selectedAssociationID);
      setSelectedAssociationID(props.selectedAssociationID);
      if (!story || !isInitialLoad || !props.selectedAssociationID?.length)
        return;
      try {
        setIsAssociationLoaderVisible(true);

        const { data: serverAssociation } = await api.get<Association>(
          `/stories/${story.story_id}/associations/${
            selectedAssociationID ?? props.selectedAssociationID
          }`,
        );

        initialAssociation.current = JSON.parse(
          JSON.stringify(serverAssociation),
        );

        setSelectedAssociation(serverAssociation);
        setAliases(serverAssociation.aliases);
        setName(serverAssociation.association_name);
        exclusionList.current = [
          serverAssociation.association_name,
          ...serverAssociation.aliases.split(","),
        ];
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            `error fetching association details: ${error.response?.status} ${error.message}`,
          );
        } else {
          console.error("unexpected error", error);
        }
      } finally {
        setIsAssociationLoaderVisible(false);
        setIsInitialLoad(false);
      }
    };
    if (props.isAssociationPanelOpen && props.selectedAssociationID)
      fetchAssociationDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.selectedAssociationID,
    story,
    isInitialLoad,
    props.isAssociationPanelOpen,
  ]);

  useEffect(() => {
    if (bgEditorRef.current) {
      bgEditorRef.current.setEditable(!isInitialLoad);
      bgEditorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs =
          selectedAssociation?.details?.extended_description.split("\n");
        paragraphs?.forEach((paragraphText) => {
          const paragraphNode = $createParagraphNode();
          const formattedText = paragraphText.replace(/\t/g, "    ");
          const textNode = $createTextNode(formattedText);
          paragraphNode.append(textNode);
          root.append(paragraphNode);
        });
      });
    }
    if (descriptionEditorRef.current) {
      descriptionEditorRef.current.setEditable(!isInitialLoad);
      descriptionEditorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs = selectedAssociation?.short_description.split("\n");
        paragraphs?.forEach((paragraphText) => {
          const paragraphNode = $createParagraphNode();
          const formattedText = paragraphText.replace(/\t/g, "    ");
          const textNode = $createTextNode(formattedText);
          paragraphNode.append(textNode);
          root.append(paragraphNode);
        });
      });
    }
  }, [selectedAssociation, descriptionEditorRef, isInitialLoad]);

  useEffect(() => {
    clearData();
  }, [chapter?.id, story?.story_id]);

  const saveEdits = () => {
    if (
      !selectedAssociationID ||
      isInitialLoad ||
      !selectedAssociation?.details
    )
      return;
    if (
      JSON.stringify(selectedAssociation) !==
      JSON.stringify(initialAssociation.current)
    ) {
      props.onEditCallback(selectedAssociation);
    }
  };

  const handleClose = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    saveEdits();
    setIsInitialLoad(true);
    props.setIsAssociationPanelOpen(false);
    setTimeout(() => {
      clearData();
    }, 500);
  };

  const onAssociationClick = (value: ClickData) => {
    if (!value.id) return;
    saveEdits();
    setIsInitialLoad(true);
    clearData();
    setSelectedAssociationID(value.id);
  };

  const extractTextAndUpdate = (editorState: EditorState, type: string) => {
    if (!selectedAssociation) return;
    isProgrammaticChange.current = true;
    let textContent = "";
    editorState.read(() => {
      const root = $getRoot();
      // Assume each child is a paragraph node.
      textContent = root
        .getChildren()
        .map((node) => node.getTextContent())
        .join("\n");
    });
    let currentValue = "";
    if (type === "background") {
      currentValue = selectedAssociation.details.extended_description;
    } else if (type === "description") {
      currentValue = selectedAssociation.short_description;
    }

    // Only update if the text actually changed (trim to ignore insignificant whitespace)
    if (textContent.trim() === currentValue.trim()) {
      return;
    }
    const updatedAssociation = { ...selectedAssociation };
    if (type === "background") {
      updatedAssociation.details.extended_description = textContent;
    } else if (type === "description") {
      updatedAssociation.short_description = textContent;
    }
    if (
      JSON.stringify(updatedAssociation) !== JSON.stringify(selectedAssociation)
    ) {
      setSelectedAssociation(updatedAssociation);
    }
    isProgrammaticChange.current = false;
  };

  const processImage = (acceptedFiles: File[]) => {
    if (!selectedAssociationID || !story || !selectedAssociation) {
      return;
    }
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = async () => {
        try {
          setIsAssociationLoaderVisible(true);

          const formData = new FormData();
          formData.append("file", file);

          const { data } = await api.put<{ url: string }>(
            `/stories/${story.story_id}/associations/${selectedAssociation.association_id}/upload`,
            formData,
            {
              params: { type: selectedAssociation.association_type },
              withCredentials: true,
              headers: {
                "Content-Type": "multipart/form-data",
              },
            },
          );

          const updatedAssociation = {
            ...selectedAssociation,
            portrait: `${data.url}?date=${Date.now()}`, // bust cache
          };

          setSelectedAssociation(updatedAssociation);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            console.error(
              `Upload failed: ${error.response?.status} ${error.message}`,
            );
          } else {
            console.error(error);
          }
        } finally {
          setIsAssociationLoaderVisible(false);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  return (
    <Drawer
      anchor={"right"}
      open={props.isAssociationPanelOpen}
      onClose={handleClose}
      ModalProps={{
        BackdropProps: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      }}
      PaperProps={{
        className: styles.associationPanel,
      }}
    >
      <Box
        role="presentation"
        component="section"
        className={styles.contentContainer}
      >
        <div
          className="loading-screen"
          style={{
            visibility: isAssociationLoaderVisible ? "visible" : "hidden",
          }}
        >
          <Box className="progress-box" />
          <Box className="prog-anim-holder">
            <CircularProgress />
          </Box>
        </div>
        <div className={styles.associationHeader}>
          <h2 className={styles.associationName}>
            <TextField
              label=""
              type="search"
              variant="filled"
              slotProps={{
                input: {
                  disableUnderline: true,
                },
              }}
              value={name}
              className={`${styles.textInput} ${styles.associationNameField} ${isNameActive ? styles.activeField : styles.inactiveField}`}
              onChange={(event) => {
                setName(event.target.value);
              }}
              onFocus={() => setIsNameActive(true)}
              onBlur={(event) => {
                setIsNameActive(false);
                if (!selectedAssociation) return;
                if (selectedAssociation.association_name === event.target.value)
                  return;
                const updatedAssociation = { ...selectedAssociation };
                updatedAssociation.association_name = event.target.value;
                setSelectedAssociation(updatedAssociation);
              }}
              sx={{
                label: {
                  color: "#333",
                },
                "& .MuiFilledInput-root": {
                  backgroundColor: "transparent",
                },
                input: {
                  color: "#333",
                  backgroundColor: "transparent",
                  paddingTop: "8px",
                },
                "& fieldset": { border: "none" },
              }}
            />
          </h2>
          <PortraitDropper
            className={styles.associationPortrait}
            imageURL={
              selectedAssociation?.portrait
                ? selectedAssociation.portrait
                : defaultImageURL.current
            }
            name={
              selectedAssociation ? selectedAssociation.association_name : ""
            }
            onComplete={processImage}
            hideLabel={true}
          />
        </div>
        <div className={styles.associationDetails}>
          <div className={styles.detailBubble}>
            <h4
              className={`${isDescriptionActive ? styles.activeLabel : styles.inactiveLabel}`}
            >
              Summary
            </h4>
            <InfoHover text="A brief description which will appear when you hover over the association, no greater than 100 characters long." />
            <div className={styles.docTextArea}>
              <LexicalComposer
                initialConfig={{
                  editable: false,
                  ...descriptionConfig,
                  editorState: (editor) => {
                    descriptionEditorRef.current = editor;
                  },
                }}
              >
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      spellCheck={false}
                      className={`${styles.editorInput} ${isDescriptionActive ? styles.activeField : styles.inactiveField}`}
                      onFocus={() => setIsDescriptionActive(true)}
                      onBlur={() => {
                        setIsDescriptionActive(false);
                        if (isInitialLoad) return;
                        const editor = descriptionEditorRef.current;
                        if (editor) {
                          const editorState = editor.getEditorState();
                          extractTextAndUpdate(editorState, "description");
                        }
                      }}
                    />
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <TextTransformPlugin />
                <CharacterLimitPlugin
                  charset="UTF-8"
                  maxLength={100}
                  renderer={(obj) => {
                    return (
                      <div className={styles.remainingChars}>
                        Remaining characters:{" "}
                        <span
                          className={`${styles.value} ${obj.remainingCharacters < 0 ? styles.exceeded : ""}`}
                        >
                          {obj.remainingCharacters}
                        </span>
                      </div>
                    );
                  }}
                />
                <AssociationDecoratorPlugin
                  isProgrammaticChange={isProgrammaticChange}
                  customLeftClick={onAssociationClick}
                  exclusionList={exclusionList.current}
                />
              </LexicalComposer>
            </div>
          </div>
          <div className={styles.detailBubble}>
            <h4
              className={`${isBackgroundActive ? styles.activeLabel : styles.inactiveLabel}`}
            >
              Background
            </h4>
            <div
              className={`${styles.docTextArea} ${styles.backgroundDescription}`}
            >
              <LexicalComposer
                initialConfig={{
                  editable: false,
                  ...bgConfig,
                  editorState: (editor) => {
                    bgEditorRef.current = editor;
                  },
                }}
              >
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      spellCheck={false}
                      className={`${styles.editorInput} ${isBackgroundActive ? styles.activeField : styles.inactiveField}`}
                      onFocus={() => setIsBackgroundActive(true)}
                      onBlur={() => {
                        setIsBackgroundActive(false);
                        if (isInitialLoad) return;
                        const editor = bgEditorRef.current;
                        if (editor) {
                          const editorState = editor.getEditorState();
                          extractTextAndUpdate(editorState, "background");
                        }
                      }}
                    />
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <TextTransformPlugin />
                <AssociationDecoratorPlugin
                  isProgrammaticChange={isProgrammaticChange}
                  customLeftClick={onAssociationClick}
                  exclusionList={exclusionList.current}
                />
              </LexicalComposer>
            </div>
          </div>
          <div className={styles.associationForm}>
            <TextField
              label="Aliases (comma separated)"
              type="search"
              variant="filled"
              slotProps={{
                input: {
                  disableUnderline: true,
                },
              }}
              value={aliases}
              className={`${styles.textInput} ${isAliasesActive ? styles.activeField : styles.inactiveField}`}
              onChange={(event) => {
                updateAliases(event.target.value);
              }}
              onFocus={() => setIsAliasesActive(true)}
              onBlur={(event) => {
                setIsAliasesActive(false);
                if (!selectedAssociation) return;
                if (selectedAssociation.aliases === event.target.value) return;
                const updatedAssociation = { ...selectedAssociation };
                updatedAssociation.aliases = event.target.value;
                setSelectedAssociation(updatedAssociation);
              }}
              sx={{
                label: {
                  color: "#333",
                },
                "& .MuiFilledInput-root": {
                  backgroundColor: "transparent",
                },
                input: {
                  color: "#333",
                  backgroundColor: "transparent",
                },
                "& fieldset": { border: "none" },
              }}
            />
            <Typography
              style={{ marginTop: "-20px", fontWeight: "bold" }}
              fontSize={"0.8rem"}
            >
              {aliasesError}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  onChange={() => {
                    if (!selectedAssociation) return;
                    const updatedAssociation = { ...selectedAssociation };
                    updatedAssociation.case_sensitive =
                      !selectedAssociation?.case_sensitive;
                    setSelectedAssociation(updatedAssociation);
                  }}
                  checked={selectedAssociation?.case_sensitive || false}
                />
              }
              label="Case-Sensitive"
            />
          </div>
        </div>
      </Box>
    </Drawer>
  );
};
