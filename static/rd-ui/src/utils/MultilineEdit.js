import React, {useState, useEffect, useRef} from 'react';
import '../css/inline-edit.css';

const MultilineEdit = (props) => {
  const [editingValue, setEditingValue] = useState(props.value);

  const onChange = (event) => setEditingValue(event.target.value);

  const onKeyDown = (event) => {
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
      event.target.blur();
    }
  };

  const onBlur = (event) => {
    if (event.target.value.trim() === '') {
      setEditingValue(props.value);
    } else {
      props.setValueCallback(event.target.value, props.id);
    }
  };

  const textareaRef = useRef();

  useEffect(() => {
    if (props.value !== editingValue) {
      setEditingValue(props.value);
    }
  }, [props.value, editingValue]);

  return (
    <textarea
      className="multiline-editable-text"
      rows={1}
      aria-label={props.label}
      defaultValue={editingValue}
      onBlur={onBlur}
      onChange={onChange}
      onKeyDown={onKeyDown}
      ref={textareaRef}
    />
  );
};

export default MultilineEdit;
