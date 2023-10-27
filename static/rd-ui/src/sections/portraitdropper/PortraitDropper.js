import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import '../../css/portrait-dropper.css';

const PortraitDropper = (props) => {
    const onDrop = useCallback((acceptedFiles) => {
        props.onComplete(acceptedFiles);
    }, [props]);
    const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop});

    return (
        <div className="portrait-dropper">
            <figure className="portrait">
                <span {...getRootProps()}>
                <img src={props.imageURL} alt={props.name} title={props.name}/>
                <figcaption>Drop an image over the picture to update, or click on it.<input {...getInputProps()}/></figcaption>
                </span>
          </figure>
        </div>);
}
export default PortraitDropper;