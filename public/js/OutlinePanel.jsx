import React from 'react';
import PropTypes from 'prop-types';
import {Globals} from './Globals.jsx';

/**
 * Right-click menu for tagging document text.
 */
export class OutlinePanel extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.storyID = props.storyID;
    this.isOpen = false;
    this.state={
      displayState: 'hidden',
      label: ''
    };
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      storyID: PropTypes.string
    };
  }

  /**
   * componentwillreceiveprops
   *
   * @param {Object} nextProps
   */
  UNSAFE_componentWillReceiveProps(nextProps) {
    this.storyID = nextProps.storyID;
    console.log('Component received new props', nextProps);
  }

  /** componentDidMount **/
  componentDidMount() {
  }

  /**
   * Get a given novel's associations list from the API.
   *
   * @return {Promise}
   */
  fetchStoryDetails() {
    return fetch(Globals.SERVICE_URL + '/story/' + this.storyID, {
      headers: Globals.getHeaders()
    }).then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            console.log(data);
            this.setState({
              displayState: 'visible',
              activeClassname: 'emerge'
            });
          });
          break;
      }
    });
  }

  /**
   * Set visibile and update assoc ID.
   *
   * @param {String} idVal
  **/
  updateAndDisplay() {
    console.log('here we go');
    this.IsOpen = true;
    this.fetchStoryDetails();
  }

  /**
   * Hide element
  **/
  hide() {
    this.IsOpen = false;
    this.setState({
      displayState: 'hidden',
      activeClassname: ''
    });
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    return (
      <div>
        <div className={'pop-panel ' + this.state.activeClassname} style={{'visibility': this.state.displayState}}>
          <div>Outline</div>
        </div>
        <div onClick={() => {this.hide();}} style={{'visibility': this.state.displayState}} className={'document-mask ' + this.state.activeClassname} />
      </div>
    );
  }
}
