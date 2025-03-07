import { Box, CircularProgress, Drawer, FormControlLabel, IconButton, Switch, TextField } from "@mui/material";
import { Association, SimplifiedAssociation } from "../../../types/Associations";
import { ClickableDecoratorNode } from "../ThreadWriterDemo/customNodes/ClickableDecoratorNode";
import styles from './association-ui.module.css'
import { PortraitDropper } from "../../PortraitDropper";
import { useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AssociationDecoratorPluginDemo } from "../ThreadWriterDemo/plugins/AssociationDecoratorPluginDemo";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { $createParagraphNode, $createTextNode, $getRoot, EditorState, LexicalEditor } from "lexical";
import { ClickData } from "../ThreadWriterDemo/plugins/DocumentClickPlugin";
import { CharacterLimitPlugin } from "@lexical/react/LexicalCharacterLimitPlugin";
import { OverflowNode } from "@lexical/overflow";
import { UCWords } from "../ThreadWriterDemo/utilities";
import CloseIcon from '@mui/icons-material/Close';

interface AssociationProps {
  onEditCallback: (association: Association) => void;
  isAssociationPanelOpen: boolean;
  setIsAssociationPanelOpen: (is: boolean) => void;
  selectedAssociationID: string | null;
  associations: SimplifiedAssociation[];
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
  namespace: 'DescriptionEditor',
  theme,
  nodes: [
    ClickableDecoratorNode,
    OverflowNode
  ],
  onError: (error: Error) => {
    console.error('descr error:', error);
  }
}
const bgConfig = {
  namespace: 'BackgroundEditor',
  theme,
  nodes: [
    ClickableDecoratorNode
  ],
  onError: (error: Error) => {
    console.error('BG error:', error);
  }
}

export const AssociationPanelDemo: React.FC<AssociationProps> = (props) => {
  const defaultImageURL = useRef("/img/default_association_portrait.jpg");
  const [selectedAssociation, setSelectedAssociation] = useState<Association | null>(null);
  const [isAssociationLoaderVisible, setIsAssociationLoaderVisible] = useState(false);
  const bgEditorRef = useRef<LexicalEditor>(null);
  const descriptionEditorRef = useRef<LexicalEditor>(null);
  const isProgrammaticChange = useRef(false);
  const initialAssociation = useRef<Association | null>(null);
  const exclusionList = useRef<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [aliases, setAliases] = useState('');
  const [isDescriptionActive, setIsDescriptionActive] = useState(false);
  const [isBackgroundActive, setIsBackgroundActive] = useState(false);
  const [isAliasesActive, setIsAliasesActive] = useState(false);
  const [selectedAssociationID, setSelectedAssociationID] = useState(props.selectedAssociationID);

  const clearData = () => {
    initialAssociation.current = null;
    setSelectedAssociation(null);
    setSelectedAssociationID(null);
    setAliases("");
    bgEditorRef.current?.update(() => {
      $getRoot().clear();
    });
    descriptionEditorRef.current?.update(() => {
      $getRoot().clear();
    });
  }

  useEffect(() => {
    if (props.isAssociationPanelOpen && props.selectedAssociationID) {
      setSelectedAssociationID(props.selectedAssociationID);
    }

  }, [props.selectedAssociationID, props.isAssociationPanelOpen]);

  useEffect(() => {
    const fetchAssociationDetails = async () => {
      if (!isInitialLoad) return;
      try {
        const selected = props.associations.find(ass => ass.association_id === selectedAssociationID) as Association;
        setSelectedAssociation(selected);
        setAliases(selected.aliases);
        exclusionList.current = [selected.association_name, ...selected.aliases.split(',')];
      } catch (error: unknown) {
        console.error(`error fetching association details: ${error}`);
      } finally {
        setIsInitialLoad(false);
      }
    };
    if (props.isAssociationPanelOpen && isInitialLoad && selectedAssociationID !== null) {
      fetchAssociationDetails();
    }
  }, [isInitialLoad, selectedAssociationID, props.isAssociationPanelOpen, props.associations])

  useEffect(() => {
    if (bgEditorRef.current) {
      bgEditorRef.current.setEditable(!isInitialLoad);
      bgEditorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs = selectedAssociation?.details?.extended_description.split("\n");
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

  const saveEdits = () => {
    if (selectedAssociation) {
      if (JSON.stringify(selectedAssociation) !== JSON.stringify(initialAssociation.current)) {
        props.onEditCallback(selectedAssociation);
      }
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
  }

  const onAssociationClick = (value: ClickData) => {
    if (!value.id) return;
    saveEdits();
    setIsInitialLoad(true);
    clearData();
    setSelectedAssociationID(value.id);
  }

  const extractTextAndUpdate = (editorState: EditorState, type: string) => {
    if (!selectedAssociation) return;
    isProgrammaticChange.current = true;
    let textContent = "";
    editorState.read(() => {
      const root = $getRoot();
      // Assume each child is a paragraph node.
      textContent = root.getChildren()
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
    if (JSON.stringify(updatedAssociation) !== JSON.stringify(selectedAssociation)) {
      setSelectedAssociation(updatedAssociation);
    }
    isProgrammaticChange.current = false;
  };

  const acceptedFileTypes = ["png", "jpg", "jpeg", "gif"];
  const processImage = (acceptedFiles: File[]) => {
    if (!selectedAssociationID || !selectedAssociation) {
      return;
    }
    acceptedFiles.forEach((file) => {

      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = async () => {
        try {
          setIsAssociationLoaderVisible(true);
          if (file.type) {
            if (!acceptedFileTypes.includes(file.type.split("image/")[1])) {
              alert("Only images of the following type are allowed: " + acceptedFileTypes.toString());
              return;
            }
          }
          const url = URL.createObjectURL(file);
          const updatedAssociation = { ...selectedAssociation };
          updatedAssociation.portrait = url;
          setSelectedAssociation(updatedAssociation);
        } catch (error: unknown) {
          console.error(error);
        } finally {
          setIsAssociationLoaderVisible(false);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  return (
    <Drawer anchor={"right"} open={props.isAssociationPanelOpen} onClose={handleClose} className={styles.associationPanel}>
      <Box className={styles.header}>
        <IconButton onClick={handleClose} sx={{ mr: 1 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box
        className={styles.section}
        role="presentation"
        component="section">
        <div
          className="loading-screen"
          style={{ visibility: isAssociationLoaderVisible ? "visible" : "hidden" }}
        >
          <Box className="progress-box" />
          <Box className="prog-anim-holder">
            <CircularProgress />
          </Box>
        </div>
        <div className={styles.associationHeader}>
          <h2 className={styles.associationName}>
            <span className={`${styles.type} ${selectedAssociation?.association_type ? selectedAssociation.association_type : ""}`}>{UCWords(selectedAssociation?.association_type ? selectedAssociation.association_type : "")}: </span>
            {selectedAssociation?.association_name}
          </h2>
          <PortraitDropper
            className={styles.associationPortrait}
            imageURL={selectedAssociation?.portrait ? selectedAssociation.portrait : defaultImageURL.current}
            name={selectedAssociation ? selectedAssociation.association_name : ""}
            onComplete={processImage}
            hideLabel={true}
          />
        </div>
        <div className={styles.associationDetails}>
          <div className={styles.detailBubble}>
            <h4 className={`${isDescriptionActive ? styles.activeLabel : styles.inactiveLabel}`}>Summary</h4>
            <div className={styles.docTextArea}>
              <LexicalComposer initialConfig={{
                editable: false,
                ...descriptionConfig,
                editorState: (editor) => {
                  descriptionEditorRef.current = editor;
                },

              }}>
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable spellCheck={false} className={`${styles.editorInput} ${isDescriptionActive ? styles.activeField : styles.inactiveField}`}
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
                <CharacterLimitPlugin charset="UTF-8" maxLength={200} renderer={(obj) => {
                  return <div className={styles.remainingChars}>Remaining characters: <span className={`${styles.value} ${obj.remainingCharacters < 0 ? styles.exceeded : ""}`}>{obj.remainingCharacters}</span></div>
                }} />
                <AssociationDecoratorPluginDemo associations={props.associations} isProgrammaticChange={isProgrammaticChange} customLeftClick={onAssociationClick} exclusionList={exclusionList.current} />
              </LexicalComposer>
            </div>
          </div>
          <div className={styles.detailBubble}>
            <h4 className={`${isBackgroundActive ? styles.activeLabel : styles.inactiveLabel}`}>Background</h4>
            <div className={styles.docTextArea}>
              <LexicalComposer initialConfig={{
                editable: false,
                ...bgConfig,
                editorState: (editor) => {
                  bgEditorRef.current = editor;
                },
              }}>
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable spellCheck={false} className={`${styles.editorInput} ${isBackgroundActive ? styles.activeField : styles.inactiveField}`}
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
                <AssociationDecoratorPluginDemo associations={props.associations} isProgrammaticChange={isProgrammaticChange} customLeftClick={onAssociationClick} exclusionList={exclusionList.current} />
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
                  disableUnderline: true
                }
              }}
              value={aliases}
              className={`${styles.textInput} ${isAliasesActive ? styles.activeField : styles.inactiveField}`}
              onChange={(event) => {
                setAliases(event.target.value)
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
                  backgroundColor: "transparent"
                },
                input: {
                  color: "#333",
                  backgroundColor: "transparent"
                },
                "& fieldset": { border: 'none' },
              }}
            />
            <FormControlLabel
              control={
                <Switch
                  onChange={() => {
                    if (!selectedAssociation) return;
                    const updatedAssociation = { ...selectedAssociation };
                    updatedAssociation.case_sensitive = !selectedAssociation?.case_sensitive;
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