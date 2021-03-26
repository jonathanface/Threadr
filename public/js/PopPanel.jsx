import React from 'react';
import PropTypes from 'prop-types';
import ContentEditable from "react-contenteditable";
import CheckIcon from '@material-ui/icons/Check';
import CloseIcon from '@material-ui/icons/Close';
import {Globals} from './Globals.jsx'

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
    this.associationID = props.associationID;
    this.novelID = props.novelID;
    this.isOpen = false;
    
    console.log('set', defaultDescriptionText);
    this.state={
      label: props.label,
      description:defaultDescriptionText,
      type: props.type,
      activeClassname:'',
      displayState:'hidden'
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
   * Set visibile and update assoc ID.
   *
   * @param {String} idVal
  **/
  updateAndDisplay(idVal) {
    this.associationID = idVal;
    this.IsOpen = true;
    this.setState({
      displayState:'visible',
      activeClassname:'emerge',
      html: "Edit <b>me</b> !"
    });
  }
  
  /**
   * Props updated from parent
   *
   * @param {Object} props
  **/
  UNSAFE_componentWillReceiveProps(props) {
    this.setState({
      type:props.type,
      label:props.label
    });
  }

  /**
   * Hide element
  **/
  hide() {
    this.IsOpen = false;
    this.setState({
      activeClassname:'',
      displayState:'hidden'
    });
  }
  
  handleChange = evt => {
    const target = evt.currentTarget.dataset.name;
    switch(target) {
      case 'title':
        this.setState({ label: evt.target.value });
        break;
      case 'description':
        this.setState({ description: evt.target.value });
        break;
    }
  };
  
  handleFocus = evt => {
    const target = evt.currentTarget.dataset.name;
    switch(target) {
      case 'description':
        if (evt.currentTarget.innerHTML == defaultDescriptionText) {
          this.setState({ description: '' });
        }
        break;
    }
  }
  
  handleBlur = evt => {
    const target = evt.currentTarget.dataset.name;
    switch(target) {
      case 'description':
        if (evt.currentTarget.innerHTML == '') {
          this.setState({ description: defaultDescriptionText });
        }
        break;
    }
  }
  
  saveAssociation() {
    fetch(Globals.SERVICE_URL + '/story/' + Globals.NOVEL_ID + '/associations', {
      method:'PUT',
      body: JSON.stringify({
        associationID:this.associationID,
        novelID:Globals.NOVEL_ID,
        name:this.state.label,
        description:this.state.description
      })
    }).then((response) => {
      response.json().then((response) => {
        console.log(response);
      })
    }).catch(err => {
      console.error(err)
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
        <div className={'pop-panel ' + this.state.activeClassname} style={{'visibility':this.state.displayState}}>
          <ContentEditable data-name="title" className="input-field" html={this.state.label} disabled={false} onChange={this.handleChange} />
          <ContentEditable data-name="description" onFocus={this.handleFocus} onBlur={this.handleBlur} className="input-field" html={this.state.description} disabled={false} onChange={this.handleChange} />
          <div className={'buttonBox'}>
            <CheckIcon onClick={() => {this.saveAssociation()}} />
            <CloseIcon onClick={() => {this.hide()}} />
          </div>
        </div>
        <div onClick={() => {this.hide()}} style={{'visibility':this.state.displayState}} className={'document-mask ' + this.state.activeClassname} />
      </div>
    );
  }
}
