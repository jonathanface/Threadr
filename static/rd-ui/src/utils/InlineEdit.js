import React, {useState, useEffect} from 'react';
import '../css/inline-edit.css';

const InlineEdit = (props) => {
  const [editingValue, setEditingValue] = useState(props.value);

  useEffect(() => {
    setEditingValue(props.value);
  }, [props.value]);

  const onChange = (event) => setEditingValue(event.target.value);

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
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

  return (
    <input
      className="inline-editable-text"
      type="text"
      aria-label={props.label}
      value={editingValue}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
};

export default InlineEdit;
