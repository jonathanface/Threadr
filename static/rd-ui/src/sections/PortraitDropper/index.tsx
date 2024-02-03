import React, { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import styles from "./portrait-dropper.module.css";

interface PortraitDropperProps {
  imageURL: string;
  name: string;
  onComplete?: Function;
  onImageLoaded?: Function;
}
const PortraitDropper = (props: PortraitDropperProps) => {
  const [imageURL, setImageURL] = useState(props.imageURL);
  const [name, setName] = useState(props.name);
  useEffect(() => {
    setImageURL(props.imageURL);
    setName(props.name);
  }, [props.imageURL, props.name]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setImageURL(URL.createObjectURL(acceptedFiles[0]));
      if (props.onComplete) {
        props.onComplete(acceptedFiles);
      }
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
    <div className={styles.portraitDropper}>
      <figure className={styles.portrait}>
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
