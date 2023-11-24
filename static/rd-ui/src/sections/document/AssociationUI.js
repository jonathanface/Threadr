import Backdrop from "@mui/material/Backdrop";
import React, { useEffect, useState } from "react";

import { FormGroup, TextField } from "@mui/material";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import "../../css/association-ui.css";
import PortraitDropper from "../portraitdropper/PortraitDropper";
import { UCWords } from "./utilities";

const AssociationUI = (props) => {
  const [caseSensitive, setCaseSensitive] = useState(
    !props.association ? false : props.association.details.case_sensitive
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [aliases, setAliases] = useState("");
  const [imageURL, setImageURL] = useState(
    !props.association ? "./img/default_association_portrait.jpg" : props.association.portrait
  );

  const handleClose = () => {
    setName("");
    setDescription("");
    setDetails("");
    setAliases("");
    setImageURL("./img/default_association_portrait.jpg");
    props.onClose();
  };

  useEffect(() => {
    if (props.association) {
      setCaseSensitive(props.association.details.case_sensitive);
      setName(UCWords(props.association.association_name));
      setImageURL(props.association.portrait + "?t=" + new Date().getDate());
      setDescription(props.association.short_description);
      setDetails(props.association.details.extended_description);
      setAliases(props.association.details.aliases);
    }
  }, [props]);

  const onAssociationEdit = (newValue, id) => {
    const newAssociation = props.association;
    let saveRequired = false;
    switch (id) {
      case "case":
        if (newAssociation.details.case_sensitive !== newValue) {
          newAssociation.details.case_sensitive = newValue;
          saveRequired = true;
        }
        break;
      case "description":
        if (newValue !== newAssociation.short_description) {
          newAssociation.short_description = newValue;
          saveRequired = true;
        }
        break;
      case "details":
        if (newValue !== newAssociation.details.extended_description) {
          newAssociation.details.extended_description = newValue;
          saveRequired = true;
        }
        break;
      case "aliases":
        if (newValue !== newAssociation.details.aliases) {
          newAssociation.details.aliases = newValue;
          saveRequired = true;
        }
        break;
      case "portrait": {
        newAssociation.portrait = newValue;
        saveRequired = true;
        break;
      }
    }
    if (saveRequired === true) {
      props.onEditCallback(newAssociation);
    }
  };

  const processImage = (acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = () => {
        const formData = new FormData();
        formData.append("file", file);
        fetch(
          "/api/stories/" +
            props.story +
            "/associations/" +
            props.association.association_id +
            "/upload?type=" +
            props.association.association_type,
          { method: "PUT", body: formData }
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

  return (
    <Backdrop onClick={handleClose} open={props.open} className="association-ui-bg">
      <div
        className="association-ui-container"
        onClick={(e) => {
          e.stopPropagation();
        }}>
        <div className="column">
          <PortraitDropper imageURL={imageURL} name={name} onComplete={processImage} />
        </div>
        <div className="column">
          <div className="association-details">
            <div>
              <h1>{name}</h1>
            </div>
            <div className="detail-bubble">
              <TextField
                label="Overview"
                helperText="hahahah dumbass"
                multiline
                rows="6"
                onBlur={(event) => {
                  onAssociationEdit(event.target.value, "description");
                }}
                sx={{
                  textarea: {
                    color: "#bbb",
                  },
                  label: {
                    color: "#F0F0F0",
                  },
                  width: "100%",
                  marginTop: "10px",
                }}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                value={description}
              />
            </div>
            <div className="detail-bubble">
              <TextField
                label="Background & Extended Details"
                multiline
                rows="6"
                onBlur={(event) => {
                  onAssociationEdit(event.target.value, "details");
                }}
                onChange={(event) => {
                  setDetails(event.target.value);
                }}
                value={details}
                sx={{
                  textarea: {
                    color: "#bbb",
                  },
                  label: {
                    color: "#F0F0F0",
                  },
                  width: "100%",
                }}
              />
            </div>
            <div className="association-form">
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

export default AssociationUI;
