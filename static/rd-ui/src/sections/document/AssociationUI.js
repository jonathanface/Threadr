import Backdrop from '@mui/material/Backdrop';
import React, {useState, useEffect, useCallback} from 'react';
import {useDropzone} from 'react-dropzone';
import '../../css/association-ui.css';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import InlineEdit from '../../utils/InlineEdit'
import MultilineEdit from '../../utils/MultilineEdit'

const AssociationUI = (props) => {
  const [caseSensitive, setCaseSensitive] = useState(!props.association ? false : props.association.details.caseSensitive.Value);
  const [headerText, setHeaderText] = useState("Unknown");
  const [description, setDescription] = useState("Here you can put a basic description.\nShift+Enter for new lines");
  const [details, setDetails] = useState("Here you can put some extended details.\nShift+Enter for new lines");

  const handleClose = () => {
    props.onClose();
  };

  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onabort = () => console.log('file reading was aborted');
      reader.onerror = () => console.log('file reading has failed');
      reader.onload = () => {
        // Do whatever you want with the file contents
        const binaryStr = reader.result;
        console.log(binaryStr);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop});

  const imageURL = !props.association ? './img/default_association_portrait.jpg' : props.association.details.portrait.Value;
  const name = !props.association ? 'some guy' : props.association.association_name;
  const type = !props.association ? 'unknown' : props.association.association_type;
  const headerLabel = !props.association ? "" : props.association.association_type[0].toUpperCase() +
        props.association.association_type.slice(1) +':';

  useEffect(() => {
    if (props.association) {
        setCaseSensitive(props.association.details.caseSensitive.Value);
        setHeaderText(props.association.association_name);
    }
  }, [props.association]);

  const onAssociationEdit = (newValue, id) => {
    const newAssociation = props.association;
    switch(id) {
        case "header":
            setHeaderText(newValue);
            newAssociation.association_name = newValue;
            break;
        case "case":
            setCaseSensitive(newValue);
            newAssociation.details.caseSensitive.Value = newValue;
            break;
        case "description":
            setDescription(newValue);
            break;
        case "details":
            setDetails(newValue);
            break;
    }
    props.onEditCallback(newAssociation);
  };

  return (
    <Backdrop onClick={handleClose} open={props.open} className="association-ui-bg">
      <div className="association-ui-container" onClick={(e)=>{e.stopPropagation();}}>
        <div className="column">
          <figure className="portrait" {...getRootProps()}>
            <img src={imageURL} alt={name} title={name}/>
            <figcaption>Drop an image over the portrait to replace, or <a>click here<input {...getInputProps()}/></a></figcaption>
          </figure>
        </div>
        <div className="column">
          <div className="association-details">
            <div>
                <h1>{headerLabel}</h1>
                <InlineEdit value={headerText} setValueCallback={onAssociationEdit} label="Name" id="header" />
            </div>
            <div className="detail-bubble">
                <MultilineEdit value={description} setValueCallback={onAssociationEdit} label="Description" id="description" />
            </div>
            <div className="detail-bubble">
                <MultilineEdit value={details} setValueCallback={onAssociationEdit} label="Details" id="details" />
            </div>
            <div className="association-form">
                <FormGroup>
                <FormControlLabel control={<Switch onChange={()=>{onAssociationEdit(!caseSensitive, "case")}} checked={caseSensitive} />} label="Case-Sensitive" />
                </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};

export default AssociationUI;
