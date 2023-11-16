import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import '../../css/portrait-dropper.css';

const PortraitDropper = (props) => {
  const [imageURL, setImageURL] = useState(props.imageURL);

  useEffect(() => {
    setImageURL(props.imageURL);
  }, [props.imageURL]);

  const onDrop = useCallback((acceptedFiles) => {
    setImageURL(URL.createObjectURL(acceptedFiles[0]));
    props.onComplete(acceptedFiles);
  }, [props]);

  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop});

  return (
    <div className="portrait-dropper">
      <figure className="portrait">
        <span {...getRootProps()}>
          <img src={imageURL} alt={props.name} title={props.name}/>
          <figcaption>Drop an image over the picture to update, or click on it.<input {...getInputProps()}/></figcaption>
        </span>
      </figure>
    </div>);
};
export default PortraitDropper;
