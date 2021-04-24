import React from 'react';
import PropTypes from 'prop-types';
import ContentEditable from 'react-contenteditable';
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import {Globals} from './Globals.jsx';

const defaultDescriptionText = 'Description';
const defaultAliasText = 'Comma, separated, list';

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
    this.onUpdateAssociationComplete = props.onUpdateAssociationComplete;
    this.state={
      typeLabel: '',
      label: props.label,
      aliases: defaultAliasText,
      description: defaultDescriptionText,
      type: props.type,
      activeClassname: '',
      displayState: 'hidden',
      caseSensitive: true
    };
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      label: PropTypes.string,
      type: PropTypes.number,
      storyID: PropTypes.string,
      onUpdateAssociationComplete: PropTypes.func
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
            let alias = defaultAliasText;
            if (data.details.aliases.length) {
              alias = data.details.aliases;
            }
            let typeLabel = '';
            switch (data.type) {
              case 0:
                typeLabel = 'Character';
                break;
              case 1:
                typeLabel = 'Place';
                break;
              case 2:
                typeLabel = 'Event';
                break;
            }
            this.setState({
              type: data.type,
              label: data.name,
              description: descr,
              aliases: alias,
              displayState: 'visible',
              activeClassname: 'emerge',
              html: 'Edit <b>me</b>!',
              typeLabel: typeLabel,
              caseSensitive: data.details.caseSensitive
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
      case 'aliases':
        this.setState({aliases: event.target.value});
        break;
      case 'case':
        this.setState((prevState) => ({
          caseSensitive: !prevState.caseSensitive
        }));
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
      case 'aliases':
        if (event.currentTarget.innerHTML == defaultAliasText) {
          this.setState({aliases: ''});
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
      case 'aliases':
        if (event.currentTarget.innerHTML == '') {
          this.setState({description: defaultAliasText});
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
        aliases: this.state.aliases,
        description: this.state.description,
        caseSensitive: this.state.caseSensitive
      })
    }).then((response) => {
      if (response.status == 200) {
        this.onUpdateAssociationComplete();
      }
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
          <div className="typeTitle">{this.state.typeLabel}</div>
          <ContentEditable data-name="title" className="input-field" html={this.state.label} disabled={false} onChange={this.handleChange} />
          <label className="checkbox-field"><input data-name="case" type="checkbox" checked={this.state.caseSensitive} onChange={this.handleChange}/>Case-sensitive</label>
          <ContentEditable data-name="aliases" onFocus={this.handleFocus} onBlur={this.handleBlur} className="input-field" html={this.state.aliases} disabled={false} onChange={this.handleChange} />
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
