import Backdrop from "@mui/material/Backdrop";
import React, { useCallback, useEffect, useState } from "react";

import { FormGroup, TextField } from "@mui/material";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { PortraitDropper } from "../PortraitDropper";
import styles from "./association-ui.module.css";
import { UCWords } from "./utilities";
import { FindHighlightable, HighlightSpan } from "./decorators";
import { Association } from "../../types/Associations";

interface AssociationProps {
  associations: Association[];
  updateView: (idx: number) => void;
  associationIdx: number | null;
  onCloseCallback: () => void;
  onEditCallback: (association: Association) => void;
  storyID: string;
  open: boolean;
}

export const AssociationPanel: React.FC<AssociationProps> = (props) => {
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [imageURL, setImageURL] = useState(
    "/img/default_association_portrait.jpg"
  );
  const [descriptionEditorState, setDescriptionEditorState] = useState(() =>
    EditorState.createEmpty()
  );
  const [backgroundEditorState, setBackgroundEditorState] = useState(() =>
    EditorState.createEmpty()
  );

  const handleClose = () => {
    setCaseSensitive(false);
    setName("");
    setAliases("");
    setImageURL("/img/default_association_portrait.jpg");
    setDescriptionEditorState(EditorState.createEmpty());
    setBackgroundEditorState(EditorState.createEmpty());
    props.onCloseCallback();
  };

  const handleAssociationClick = useCallback(
    (association: Association) => {
      const idx = props.associations.findIndex(
        (ass) => ass.association_id === association.association_id
      );
      props.updateView(idx);
    },
    [props]
  );

  const createDecorators = useCallback(() => {
    if (props.associationIdx === null) {
      return;
    }

    const thisAssociation = props.associations[props.associationIdx];
    const decorators = new Array(props.associations.length);
    props.associations.forEach((ass) => {
      if (ass.association_id !== thisAssociation.association_id) {
        decorators.push({
          strategy: FindHighlightable(
            `${ass.association_type}`,
            ass.association_name,
            props.associations
          ),
          component: HighlightSpan,
          props: {
            association: ass,
            leftClickFunc: handleAssociationClick,
            classModifier: "association-ui",
          },
        });
      }
    });
    return new CompositeDecorator(decorators);
  }, [props, handleAssociationClick]);

  useEffect(() => {
    if (props.associationIdx === null) {
      return;
    }
    const thisAssociation = props.associations[props.associationIdx];
    if (thisAssociation && thisAssociation.association_id) {
      setCaseSensitive(thisAssociation.details.case_sensitive);
      setName(UCWords(thisAssociation.association_name));
      setImageURL(thisAssociation.portrait);
      setDescriptionEditorState(
        EditorState.createWithContent(
          ContentState.createFromText(thisAssociation.short_description),
          createDecorators()
        )
      );
      setBackgroundEditorState(
        EditorState.createWithContent(
          ContentState.createFromText(
            thisAssociation.details.extended_description
          ),
          createDecorators()
        )
      );
      setAliases(thisAssociation.details.aliases);
    }
  }, [
    props.associations,
    props.associationIdx,
    props.storyID,
    props.open,
    createDecorators,
    handleAssociationClick,
  ]);

  const onAssociationEdit = (newValue: string | boolean, id: string) => {
    if (props.associationIdx === null) {
      return;
    }
    const newAssociation = props.associations[props.associationIdx];
    let saveRequired = false;
    switch (id) {
      case "case":
        if (
          typeof newValue === "boolean" &&
          newAssociation.details.case_sensitive !== newValue
        ) {
          newAssociation.details.case_sensitive = newValue;
          saveRequired = true;
        }
        break;
      case "description":
        if (
          typeof newValue === "string" &&
          newValue !== newAssociation.short_description
        ) {
          newAssociation.short_description = newValue;
          saveRequired = true;
        }
        break;
      case "details":
        if (
          typeof newValue === "string" &&
          newValue !== newAssociation.details.extended_description
        ) {
          newAssociation.details.extended_description = newValue;
          saveRequired = true;
        }
        break;
      case "aliases":
        if (
          typeof newValue === "string" &&
          newValue !== newAssociation.details.aliases
        ) {
          newAssociation.details.aliases = newValue;
          saveRequired = true;
        }
        break;
      case "portrait": {
        if (typeof newValue === "string") {
          newAssociation.portrait = newValue;
          saveRequired = true;
        }
        break;
      }
    }
    if (saveRequired === true) {
      props.onEditCallback(newAssociation);
    }
  };

  const processImage = (acceptedFiles: File[]) => {
    if (props.associationIdx === null) {
      return;
    }
    const thisAssociation = props.associations[props.associationIdx];
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = () => {
        const formData = new FormData();
        formData.append("file", file);
        fetch(
          "/api/stories/" +
          props.storyID +
          "/associations/" +
          thisAssociation.association_id +
          "/upload?type=" +
          thisAssociation.association_type,
          { credentials: "include", method: "PUT", body: formData }
        )
          .then((response) => {
            if (response.ok) {
              return response.json();
            }
            throw new Error("Fetch problem image upload " + response.status);
          })
          .then((data) => {
            setImageURL(data.url + "?date=" + Date.now());
            onAssociationEdit(data.url, "portrait");
          })
          .catch((error) => console.error(error));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const updateBackgroundEditorState = (newEditorState: EditorState) => {
    setBackgroundEditorState(newEditorState);
    onAssociationEdit(
      newEditorState.getCurrentContent().getPlainText(),
      "details"
    );
  };

  const updateDescriptionEditorState = (newEditorState: EditorState) => {
    setDescriptionEditorState(newEditorState);
    onAssociationEdit(
      newEditorState.getCurrentContent().getPlainText(),
      "description"
    );
  };

  return (
    <Backdrop
      onClick={handleClose}
      open={props.open}
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
            onComplete={processImage}
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
                <Editor
                  preserveSelectionOnBlur={true}
                  editorState={descriptionEditorState}
                  onChange={updateDescriptionEditorState}
                />
              </div>
            </div>
            <div className={styles.detailBubble}>
              Background
              <div className={styles.docBG}>
                <Editor
                  preserveSelectionOnBlur={true}
                  editorState={backgroundEditorState}
                  onChange={updateBackgroundEditorState}
                />
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
                  onAssociationEdit(event.target.value, "aliases");
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
                        onAssociationEdit(!caseSensitive, "case");
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
