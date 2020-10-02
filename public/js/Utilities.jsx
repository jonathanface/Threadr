import React from 'react';
import ArrowDropDown from '@material-ui/icons/ArrowDropDown';
import Checkmark from '@material-ui/icons/Check';
import PropTypes from 'prop-types';

/**
 * Custom select element.
 * @constructor
 */
export class DocSelector extends React.Component {
  /**
   * constructor
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.type = props.type;
    this.changeHandler = props.action;
    this.state = {
      menuDisplay: 'none',
      options: props.options,
      value: props.value
    };
  }

  /**
   * show/hide the list of options after user click
   * @param {Event} event
  **/
  toggleOptions(event) {
    event.preventDefault();
    let display = this.state.menuDisplay;
    display == 'none' ? display = 'inline' : display = 'none';
    this.setState({
      menuDisplay: display
    });
  }

  /**
   * Update selection from parent
   * @param {string} newValue
   */
  update(newValue) {
    this.setState({
      value: this.state.options.get(newValue)
    });
  }

  /**
   * select an item in the list
   * @param {Event} event
   */
  selectItem(event) {
    event.preventDefault();
    const selection = event.target.innerHTML;
    if (selection == this.state.value) {
      this.setState({
        menuDisplay: 'none'
      });
      return;
    }
    this.setState({
      menuDisplay: 'none',
      value: event.target.innerHTML
    });
    this.changeHandler(this.type, event.target.dataset.value);
  }

  /**
   * Get all selectable options for the select.
   * @return {React.Fragment}
   */
  getOptions() {
    const iterator = this.state.options.keys();
    return (
      <React.Fragment>
        {
          Array.from(this.state.options.values()).map((value, key) => (
            <li key={key} onMouseDown={(e) => this.selectItem(e)} data-value={iterator.next().value}>{value}</li>
          ))
        }
      </React.Fragment>
    );
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    return (
      <span className="customSelect">
        <span onMouseDown={(e) => this.toggleOptions(e)}>{this.state.value}</span>
        <ArrowDropDown onMouseDown={(e) => this.toggleOptions(e)}/>
        <ul style={{display: this.state.menuDisplay}}>
          {this.getOptions()}
        </ul>
      </span>
    );
  }
}

DocSelector.propTypes = {
  options: PropTypes.object,
  value: PropTypes.string,
  action: PropTypes.func,
  type: PropTypes.string
};
