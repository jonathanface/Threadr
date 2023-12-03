import React, { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import "../../css/portrait-dropper.css";

const PortraitDropper = (props) => {
  const [imageURL, setImageURL] = useState(props.imageURL);
  const [name, setName] = useState(props.name);
  useEffect(() => {
    setImageURL(props.imageURL);
    setName(props.name);
  }, [props.imageURL, props.name]);

  const onDrop = useCallback(
    (acceptedFiles) => {
      setImageURL(URL.createObjectURL(acceptedFiles[0]));
      props.onComplete(acceptedFiles);
    },
    [props]
  );

  const onImageLoaded = () => {
    if (props.onImageLoaded) {
      props.onImageLoaded();
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="portrait-dropper">
      <figure className="portrait">
        <span {...getRootProps()}>
          <img src={imageURL} onLoad={onImageLoaded} alt={name} title={name} />
          <figcaption>
            Drop an image over the picture to update, or click on it.
            <input {...getInputProps()} />
          </figcaption>
        </span>
      </figure>
    </div>
  );
};
export default PortraitDropper;
