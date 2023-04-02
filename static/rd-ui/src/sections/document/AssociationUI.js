import Backdrop from '@mui/material/Backdrop';
import React, {useEffect, useCallback} from 'react';
import Dropzone from 'react-dropzone';
import {useDropzone} from 'react-dropzone';
import '../../css/association-ui.css';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';

const AssociationUI = (props) => {
  const [caseSensitive, setCaseSensitive] = React.useState(!props.association ? false : props.association.details.caseSensitive.Value);
  const handleCaseSensitiveChange = () => {
    setCaseSensitive(!caseSensitive);
  };
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

  useEffect(() => {
    if (props.association) {
        setCaseSensitive(props.association.details.caseSensitive.Value);
    }
  }, [props.association])


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
            <div><h1>{type[0].toUpperCase() + type.slice(1) + ': ' + name}</h1></div>
            <div className="detail-bubble">Info about this thing</div>
            <div className="detail-bubble">extended details about this thing</div>
            <div className="association-form">
                <FormGroup>
                <FormControlLabel control={<Switch onChange={handleCaseSensitiveChange} checked={caseSensitive} />} label="Case-Sensitive" />
                </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};

export default AssociationUI;
