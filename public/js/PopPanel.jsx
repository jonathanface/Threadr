import React from 'react';
import PropTypes from 'prop-types';
import ContentEditable from 'react-contenteditable';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import {Globals} from './Globals.jsx';

const defaultDescriptionText = 'Description';

/**
 * Right-click menu for tagging document text.
 */
export class PopPanel extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.associationID = null;
    this.storyID = props.storyID;
    this.isOpen = false;
    console.log('lbl ' + props.label);
    console.log('setup for', this.associationID);
    this.state={
      label: props.label,
      description: defaultDescriptionText,
      type: props.type,
      activeClassname: '',
      displayState: 'hidden'
    };
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      label: PropTypes.string,
      type: PropTypes.number,
      storyID: PropTypes.string
    };
  }

  /** componentDidMount **/
  componentDidMount() {
  }

  /**
   * Get a given novel's associations list from the API.
   *
   * @return {Promise}
   */
  fetchAssociationDetails() {
    return fetch(Globals.SERVICE_URL + '/association/' + this.associationID, {
      headers: Globals.getHeaders()
    }).then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            let descr = defaultDescriptionText;
            if (data.details.description.length) {
              descr = data.details.description;
            }
            this.setState({
              type: data.type,
              label: data.text,
              description: descr,
              displayState: 'visible',
              activeClassname: 'emerge',
              html: 'Edit <b>me</b>!'
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
  updateAndDisplay(idVal) {
    console.log('clicked', idVal);
    this.associationID = idVal;
    this.IsOpen = true;
    this.fetchAssociationDetails();
  }

  /**
   * Hide element
  **/
  hide() {
    this.IsOpen = false;
    this.setState({
      activeClassname: '',
      displayState: 'hidden'
    });
  }

  /**
   * triggered by changing the title or description of an association.
   *
   * @param {Event} event
   */
  handleChange = (event) => {
    const target = event.currentTarget.dataset.name;
    switch (target) {
      case 'title':
        this.setState({label: event.target.value});
        break;
      case 'description':
        this.setState({description: event.target.value});
        break;
    }
  };

  /**
   * triggered by focusing on the title or description of an association.
   *
   * @param {Event} event
   */
  handleFocus = (event) => {
    const target = event.currentTarget.dataset.name;
    switch (target) {
      case 'description':
        if (event.currentTarget.innerHTML == defaultDescriptionText) {
          this.setState({description: ''});
        }
        break;
    }
  }

  /**
   * triggered by focusing off the title or description of an association.
   *
   * @param {Event} event
   */
  handleBlur = (event) => {
    const target = event.currentTarget.dataset.name;
    switch (target) {
      case 'description':
        if (event.currentTarget.innerHTML == '') {
          this.setState({description: defaultDescriptionText});
        }
        break;
    }
  }

  /**
   * Post a new text association to the API.
   */
  saveAssociation() {
    fetch(Globals.SERVICE_URL + '/story/' + this.storyID + '/associations', {
      method: 'PUT',
      headers: Globals.getHeaders(),
      body: JSON.stringify({
        associationID: this.associationID,
        storyID: this.storyID,
        name: this.state.label,
        description: this.state.description
      })
    }).then((response) => {
      response.json().then((response) => {
        console.log(response);
      });
    }).catch((err) => {
      console.error(err);
    });
    this.hide();
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    return (
      <div>
        <div className={'pop-panel ' + this.state.activeClassname} style={{'visibility': this.state.displayState}}>
          <ContentEditable data-name="title" className="input-field" html={this.state.label} disabled={false} onChange={this.handleChange} />
          <ContentEditable data-name="description" onFocus={this.handleFocus} onBlur={this.handleBlur} className="input-field" html={this.state.description} disabled={false} onChange={this.handleChange} />
          <div className={'buttonBox'}>
            <CheckIcon onClick={() => {this.saveAssociation();}} />
            <CloseIcon onClick={() => {this.hide();}} />
          </div>
        </div>
        <div onClick={() => {this.hide();}} style={{'visibility': this.state.displayState}} className={'document-mask ' + this.state.activeClassname} />
      </div>
    );
  }
}
