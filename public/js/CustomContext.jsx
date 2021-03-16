import React from 'react';
import PropTypes from 'prop-types';
import {Globals} from './globals.jsx'

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
      items: props.items,
      selected: props.selected,
      display: 'none',
      x: 0,
      y: 0
    };
    this.socket = props.socket;
    this.novelID = props.novelID;
    this.IsOpen = false;
    this.divElement = React.createRef();
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      items: PropTypes.string,
      selected: PropTypes.string
    };
  }
  
  createNewAssociation(text, type) {
    console.log('adding new', type, text);
    if (this.socket.isOpen && text.trim().length) {
      this.socket.send(JSON.stringify({command: 'newAssociation', data: {text: text.trim(), type:type, novelID: this.novelID}}));
    }
  }

  /** componentDidMount **/
  componentDidMount() {
  }

  /**
   * Set visibile and update x and y position.
   *
   * @param {Number} xpos
   * @param {Number} ypos
  **/
  updateAndDisplay(xpos, ypos) {
    this.IsOpen = true;
    this.setState({display: 'inline-block', x: xpos, y: ypos});
  }

  /**
   * Hide element
  **/
  hide() {
    this.IsOpen = false;
    this.setState({display: 'none'});
  }

  /**
   * Handler for menu element click
   *
   * @param {Event} event
   * @param {Object} item
  **/
  selectContextItem(event, item) {
    event.stopPropagation();
    event.preventDefault();
    const json = JSON.parse(this.state.items);
    const elementIndex = json.findIndex((element) => element.label == item.label);
    if (elementIndex != -1 && Object.prototype.hasOwnProperty.call(json[elementIndex], 'subitems')) {
      if (json[elementIndex].classes.includes('closed')) {
        json[elementIndex].classes[json[elementIndex].classes.indexOf('closed')] = 'open';
        json[elementIndex].subitems.forEach( (subitem) => {
          subitem.classes[subitem.classes.indexOf('hidden')] = 'visible';
        });
      } else if (json[elementIndex].classes.includes('open')) {
        json[elementIndex].classes[json[elementIndex].classes.indexOf('open')] = 'closed';
        json[elementIndex].subitems.forEach( (subitem) => {
          subitem.classes[subitem.classes.indexOf('visible')] = 'hidden';
        });
      }
      this.setState({
        items: JSON.stringify(json)
      });
    } else if (Object.prototype.hasOwnProperty.call(item, 'type')) {
      this.createNewAssociation(this.state.selected, item.type);
      this.hide();
    } else {
      this.hide();
    }
  }

  /**
   * Props updated from parent
   *
   * @param {Object} props
  **/
  UNSAFE_componentWillReceiveProps(props) {
    this.socket = props.socket;
    this.setState({
      selected: props.selected
    });
  }

  /**
   * Parse passed object into element
   *
   * @param {Object} item
   * @return {element}
  **/
  elementFromObject(item) {
    let hasChildren = false;
    if (Object.prototype.hasOwnProperty.call(item, 'subitems')) {
      hasChildren = true;
    }
    return <div key={item.label}><div className={item.classes.join(' ')} onClick={(e) => this.selectContextItem(e, item)}><span className="title">{item.label}</span>
      {
        hasChildren ? item.subitems.map((subitem) => {
          return this.elementFromObject(subitem);
        }) : ''
      }
    </div></div>;
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    const myStyle = {
      'position': 'absolute',
      'top': this.state.y,
      'left': this.state.x,
      'display': this.state.display
    };
    const json = JSON.parse(this.state.items);
    return <div ref={this.divElement} className='custom-context' id='contextMenu' style={myStyle}>
      <div className="selected">{this.state.selected}</div>
      {json.map((item) => {
        return this.elementFromObject(item);
      })}
    </div>;
  }
}
