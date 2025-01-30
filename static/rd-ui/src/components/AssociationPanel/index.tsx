import Backdrop from "@mui/material/Backdrop";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FormGroup, TextField } from "@mui/material";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { PortraitDropper } from "../PortraitDropper";
import styles from "./association-ui.module.css";
import { UCWords } from "../ThreadWriter/utilities";
import { Association, SimplifiedAssociation } from "../../types/Associations";
import { useSelections } from "../../hooks/useSelections";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { AssociationDecoratorPlugin } from "../ThreadWriter/plugins/AssociationDecoratorPlugin";
import { ClickableDecoratorNode } from "../ThreadWriter/customNodes/ClickableDecoratorNode";
import { $createParagraphNode, $createTextNode, $getRoot, EditorState } from "lexical";
import { useLoader } from "../../hooks/useLoader";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";

interface AssociationProps {
  associations: SimplifiedAssociation[] | null;
  onEditCallback: (association: Association) => void;
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
    ClickableDecoratorNode
  ],
  onError: (error: Error) => {
    console.error('BG error:', error);
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

export const AssociationPanel: React.FC<AssociationProps> = (props) => {
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [imageURL, setImageURL] = useState(
    "/img/default_association_portrait.jpg"
  );
  const [description, setDescription] = useState('');
  const [background, setBackground] = useState('');
  const { story } = useSelections();
  const isProgrammaticChange = useRef(false);


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bgEditorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const descriptionEditorRef = useRef<any>(null);
  //const { showLoader, hideLoader } = useLoader();
  const [fullAssociations, setFullAssociations] = useState<Association[] | null>(null);
  const [exclusionList, setExclusionList] = useState<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const setProgrammaticChange = useCallback((value: boolean) => {
    isProgrammaticChange.current = value;
  }, []);

  const clearData = () => {
    setCaseSensitive(false);
    setName("");
    setAliases("");
    setImageURL("/img/default_association_portrait.jpg");
    setDescription('');
    setBackground('');
    bgEditorRef.current.update(() => {
      $getRoot().clear();
    });
    descriptionEditorRef.current.update(() => {
      $getRoot().clear();
    });
  }

  const handleClose = () => {
    //deselectAssociation();
    setIsInitialLoad(true);
    //setIsAssociationPanelOpen(false);
    setTimeout(() => {
      clearData();
    }, 500);
  };

  // useEffect(() => {
  //   if (isAssociationPanelOpen && props.associations) {
  //     if (isInitialLoad) {
  //       setFullAssociations(
  //         props.associations.map(assoc => ({
  //           association_id: assoc.association_id,
  //           association_name: assoc.association_name,
  //           association_type: assoc.association_type,
  //           short_description: assoc.short_description,
  //           portrait: assoc.portrait,
  //           details: {
  //             aliases: "",
  //             case_sensitive: true,
  //             extended_description: "",
  //           },
  //         }))
  //       );
  //     }
  //     if (currentStory && currentAssociationID) {
  //       const thisAssociation = props.associations.find(assoc => assoc.association_id === currentAssociationID);
  //       if (thisAssociation) {
  //         setName(UCWords(thisAssociation.association_name));
  //         setImageURL(thisAssociation.portrait);
  //       }
  //     }
  //   }
  // }, [isAssociationPanelOpen, props.associations, isInitialLoad]);

  // useEffect(() => {
  //   const fetchAssociationDetails = async () => {
  //     if (!currentStory || !currentAssociationID || !isInitialLoad || !fullAssociations) return;
  //     try {
  //       setIsLoaderVisible(true);
  //       const response = await fetch(`/api/stories/${currentStory.story_id}/associations/${currentAssociationID}`);
  //       if (!response.ok) throw response;
  //       const association = await response.json() as Association;
  //       setFullAssociations(fullAssociations.map(assoc => {
  //         if (assoc.association_id === currentAssociationID) {
  //           return association;
  //         }
  //         return assoc;
  //       }));
  //       setDescription(association.short_description);
  //       setCaseSensitive(association.details.case_sensitive);
  //       setAliases(association.details.aliases);
  //       setBackground(association.details.extended_description);
  //       setExclusionList([association.association_name, ...association.details.aliases.split(',')]);
  //     } catch (error: unknown) {
  //       console.error(`error fetching association details: ${error}`);
  //     } finally {
  //       setIsLoaderVisible(false);
  //       setIsInitialLoad(false);
  //     }
  //   };

  //   if (isAssociationPanelOpen) {
  //     fetchAssociationDetails();
  //   }
  // }, [isAssociationPanelOpen, currentAssociationID, currentStory, isInitialLoad, fullAssociations]);

  // const onAssociationEdit = (newValue: string | boolean, id: string) => {
  //   if (!currentAssociationID || !fullAssociations || isInitialLoad) return;

  //   setFullAssociations(prev => prev ?
  //     prev?.map(assoc => {
  //       if (assoc.association_id === currentAssociationID) {
  //         const updatedAssociation = { ...assoc };
  //         let saveRequired = false;

  //         switch (id) {
  //           case "case":
  //             if (typeof newValue === "boolean" && updatedAssociation.details.case_sensitive !== newValue) {
  //               updatedAssociation.details.case_sensitive = newValue;
  //               saveRequired = true;
  //             }
  //             break;
  //           case "description":
  //             if (typeof newValue === "string" && updatedAssociation.short_description !== newValue) {
  //               updatedAssociation.short_description = newValue.trim();
  //               saveRequired = true;
  //             }
  //             break;
  //           case "background":
  //             if (typeof newValue === "string" && updatedAssociation.details.extended_description !== newValue) {
  //               updatedAssociation.details.extended_description = newValue.trim();
  //               saveRequired = true;
  //             }
  //             break;
  //           case "aliases":
  //             if (typeof newValue === "string" && updatedAssociation.details.aliases !== newValue) {
  //               updatedAssociation.details.aliases = newValue.trim();
  //               saveRequired = true;
  //             }
  //             break;
  //           case "portrait":
  //             if (typeof newValue === "string" && updatedAssociation.portrait !== newValue) {
  //               updatedAssociation.portrait = newValue;
  //               saveRequired = true;
  //             }
  //             break;
  //         }

  //         if (saveRequired) {
  //           props.onEditCallback(updatedAssociation);
  //         }

  //         return updatedAssociation;
  //       }

  //       return assoc;
  //     }) : prev
  //   );
  // };

  // const processImage = (acceptedFiles: File[]) => {
  //   if (!currentAssociationID || !currentStory) {
  //     return;
  //   }
  //   const thisAssociation = fullAssociations?.find((assoc: Association) => { return assoc.association_id === currentAssociationID });
  //   if (!thisAssociation) return;
  //   acceptedFiles.forEach((file) => {
  //     const reader = new FileReader();
  //     reader.onabort = () => console.log("file reading was aborted");
  //     reader.onerror = () => console.log("file reading has failed");
  //     reader.onload = () => {
  //       const formData = new FormData();
  //       formData.append("file", file);
  //       fetch(
  //         "/api/stories/" +
  //         currentStory.story_id +
  //         "/associations/" +
  //         thisAssociation.association_id +
  //         "/upload?type=" +
  //         thisAssociation.association_type,
  //         { credentials: "include", method: "PUT", body: formData }
  //       )
  //         .then((response) => {
  //           if (response.ok) {
  //             return response.json();
  //           }
  //           throw new Error("Fetch problem image upload " + response.status);
  //         })
  //         .then((data) => {
  //           setImageURL(data.url + "?date=" + Date.now());
  //           onAssociationEdit(data.url, "portrait");
  //         })
  //         .catch((error) => console.error(error));
  //     };
  //     reader.readAsArrayBuffer(file);
  //   });
  // };

  useEffect(() => {
    if (bgEditorRef.current) {
      bgEditorRef.current.setEditable(!isInitialLoad);
      bgEditorRef.current.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraphs = background.split("\n");
        paragraphs.forEach((paragraphText) => {
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
        const paragraphs = description.split("\n");
        paragraphs.forEach((paragraphText) => {
          const paragraphNode = $createParagraphNode();
          const formattedText = paragraphText.replace(/\t/g, "    ");
          const textNode = $createTextNode(formattedText);
          paragraphNode.append(textNode);
          root.append(paragraphNode);
        });
      });
    }
  }, [bgEditorRef.current, background, descriptionEditorRef, description]);

  const onAssociationClick = () => {
    setIsInitialLoad(true);
    clearData();
  }

  // const extractTextAndSave = (editorState: EditorState, type: string) => {
  //   let textContent = "";
  //   editorState.read(() => {
  //     const root = $getRoot();
  //     root.getChildren().forEach((node) => {
  //       textContent += node.getTextContent();
  //     });
  //   });
  //   onAssociationEdit(textContent, type);
  // }

  return (
    <Backdrop
      onClick={handleClose}
      open={false}
      className={styles.associationUIBG}
    >
      <div
        className={styles.associationUIContainer}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className={styles.column}>
          <PortraitDropper
            imageURL={imageURL}
            name={name}
          //onComplete={processImage}
          />
        </div>
        <div className={styles.column}>
          <div className={styles.associationDetails}>
            <div>
              <h1>{name}</h1>
            </div>
            <div className={styles.detailBubble}>
              Overview
              <div className={styles.docBG}>
                {/* <LexicalComposer initialConfig={{
                  editable: false,
                  ...descriptionConfig,
                  editorState: (editor) => {
                    descriptionEditorRef.current = editor;
                  },

                }}>
                  <RichTextPlugin
                    contentEditable={<ContentEditable className={styles.editorInput} onBlur={() => {
                      if (isInitialLoad) return;
                      const editor = descriptionEditorRef.current;
                      if (editor) {
                        const editorState = editor.getEditorState();
                        //extractTextAndSave(editorState, "description");
                      }
                    }} />}
                    ErrorBoundary={LexicalErrorBoundary}
                  />
                  <HistoryPlugin />
                  <AssociationDecoratorPlugin associations={props.associations} setProgrammaticChange={setProgrammaticChange} customLeftClick={onAssociationClick} exclusionList={exclusionList} />
                </LexicalComposer> */}
              </div>
            </div>
            <div className={styles.detailBubble}>
              Background
              <div className={styles.docBG}>
                {/* <LexicalComposer initialConfig={{
                  editable: false,
                  ...bgConfig,
                  editorState: (editor) => {
                    bgEditorRef.current = editor;
                  },
                }}>
                  <RichTextPlugin
                    contentEditable={<ContentEditable className={styles.editorInput} onBlur={() => {
                      if (isInitialLoad) return;
                      const editor = bgEditorRef.current;
                      if (editor) {
                        const editorState = editor.getEditorState();
                        //extractTextAndSave(editorState, "background");
                      }
                    }} />}
                    ErrorBoundary={LexicalErrorBoundary}
                  />
                  <HistoryPlugin />
                  <AssociationDecoratorPlugin associations={props.associations} setProgrammaticChange={setProgrammaticChange} customLeftClick={onAssociationClick} />
                </LexicalComposer> */}
              </div>
            </div>
            <div className={styles.associationForm}>
              <TextField
                label="Aliases (comma separated)"
                type="search"
                value={aliases}
                onChange={(event) => {
                  setAliases(event.target.value);
                }}
                onBlur={(event) => {
                  //onAssociationEdit(event.target.value, "aliases");
                }}
                sx={{
                  label: {
                    color: "#F0F0F0",
                  },
                  input: {
                    color: "#bbb",
                  },
                }}
              />
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      onChange={() => {
                        setCaseSensitive(!caseSensitive);
                        //onAssociationEdit(!caseSensitive, "case");
                      }}
                      checked={caseSensitive || false}
                    />
                  }
                  label="Case-Sensitive"
                />
              </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};
