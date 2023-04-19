import Backdrop from '@mui/material/Backdrop';
import React, {useState, useEffect, useCallback} from 'react';
import {useDropzone} from 'react-dropzone';
import '../../css/association-ui.css';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import InlineEdit from '../../utils/InlineEdit';
import MultilineEdit from '../../utils/MultilineEdit';
import { FormControl, FormGroup, InputLabel, TextField } from '@mui/material';

const AssociationUI = (props) => {
  const [caseSensitive, setCaseSensitive] = useState(!props.association ? false : props.association.details.case_sensitive);
  const [headerText, setHeaderText] = useState('Unknown');
  const [description, setDescription] = useState('Here you can put a basic description.\nShift+Enter for new lines');
  const [details, setDetails] = useState('Here you can put some extended details.\nShift+Enter for new lines');
  const [aliases, setAliases] = useState('');
  const [imageURL, setImageURL] = useState(!props.association ? './img/default_association_portrait.jpg' : props.association.portrait);

  const handleClose = () => {
    props.onClose();
  };

  const name = !props.association ? 'some guy' : props.association.association_name;
  const type = !props.association ? 'unknown' : props.association.association_type;
  const headerLabel = !props.association ? '' : props.association.association_type[0].toUpperCase() +
        props.association.association_type.slice(1) +':';
  const aliasText = !props.association || props.association.details.aliases.trim() === '' ? '' : props.association.details.aliases;

  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log('file reading was aborted');
      reader.onerror = () => console.log('file reading has failed');
      reader.onload = () => {
        const formData = new FormData();
        formData.append('file', file);
        fetch('/api/stories/' + props.story + '/associations/' + props.association.association_name + '/upload?type=' + props.association.association_type,
            {method: 'PUT', body: formData}
        ).then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Fetch problem image upload ' + response.status);
        }).then((data) => {
          setImageURL(data.url + '?date='+Date.now());
         }).catch((error) => console.error(error));
      };
      reader.readAsArrayBuffer(file);
    });
  }, [props]);
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop});


  useEffect(() => {
    if (props.association) {
      setCaseSensitive(props.association.details.case_sensitive);
      setHeaderText(props.association.association_name);
      setImageURL(props.association.portrait);
      setDescription(props.association.short_description);
      setDetails(props.association.details.extended_description);
      setAliases(props.association.details.aliases);
    }
  }, [props.association]);

  const onAssociationEdit = (newValue, id) => {
    const newAssociation = props.association;
    let saveRequired = false;
    switch (id) {
      case 'case':
        setCaseSensitive(newValue);
        newAssociation.details.case_sensitive = newValue;
        saveRequired = true;
        break;
      case 'description':
        if (newValue !== description) {
          setDescription(newValue);
          newAssociation.short_description = newValue;
          saveRequired = true;
        }
        break;
      case 'details':
        if (newValue !== details) {
          setDetails(newValue);
          newAssociation.details.extended_description = newValue;
          saveRequired = true;
        }
        break;
      case 'aliases':
        if (newValue !== aliases) {
          setAliases(newValue);
          newAssociation.details.aliases = newValue;
          saveRequired = true;
        }
        break;
    }
    if (saveRequired === true) {
      props.onEditCallback(newAssociation);
    }
  };

  return (
    <Backdrop onClick={handleClose} open={props.open} className="association-ui-bg">
      <div className="association-ui-container" onClick={(e)=>{e.stopPropagation();}}>
        <div className="column">
          <figure className="portrait" {...getRootProps()}>
            <img src={imageURL} alt={name} title={name}/>
            <figcaption>Drop an image over the portrait to replace, or click here<input {...getInputProps()}/></figcaption>
          </figure>
        </div>
        <div className="column">
          <div className="association-details">
            <div>
              <h1>{headerLabel + headerText}</h1>
              
            </div>
            <div className="detail-bubble">
              <MultilineEdit value={description} setValueCallback={onAssociationEdit} label="Description" id="description" />
            </div>
            <div className="detail-bubble">
              <MultilineEdit value={details} setValueCallback={onAssociationEdit} label="Details" id="details" />
            </div>
            <div className="association-form">
              <TextField label="Aliases (comma separated)" type="search" value={aliases} onChange={(event)=>{onAssociationEdit(event.target.value, "aliases")}}/>
              <FormGroup>
                <FormControlLabel control={<Switch onChange={()=>{onAssociationEdit(!caseSensitive, 'case');}} checked={caseSensitive || false} />} label="Case-Sensitive" />
              </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};

export default AssociationUI;
