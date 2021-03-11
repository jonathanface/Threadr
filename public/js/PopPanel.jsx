import React from 'react';
import PropTypes from 'prop-types';

/**
 * Right-click menu for tagging document text.
 */
export class CustomContext extends React.Component {
  
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    
    this.state={
      label: props.label,
      type: props.type
    };
  }
  
  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      label: PropTypes.string,
      type: PropTypes.number
    };
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    
  }
}
