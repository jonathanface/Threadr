import React from 'react';
import Immutable from 'immutable';
import {EditorState, Editor, SelectionState, ContentState, ContentBlock, Modifier, RichUtils, getDefaultKeyBinding, CompositeDecorator, Entity, CharacterMetadata, convertToRaw} from 'draft-js';
import {CustomContext} from './CustomContext.jsx';
import {PopPanel} from './PopPanel.jsx';
import {DialogPrompt} from './DialogPrompt.jsx';
import FormatAlignLeftIcon from '@material-ui/icons/FormatAlignLeft';
import FormatAlignRightIcon from '@material-ui/icons/FormatAlignRight';
import FormatAlignCenterIcon from '@material-ui/icons/FormatAlignCenter';
import FormatAlignJustifyIcon from '@material-ui/icons/FormatAlignJustify';
import FormatLineSpacingIcon from '@material-ui/icons/FormatLineSpacing';
import {Globals} from './Globals.jsx';
import PropTypes from 'prop-types';
import {ToastContainer, toast} from 'react-toastify';


const addMenu = [
  {label: 'Tag', classes: ['item', 'parent', 'closed'], subitems: [
    {label: 'Character', type: Globals.COMM_TYPE_NEWCHAR, classes: ['item', 'child', 'hidden']},
    {label: 'Place', type: Globals.COMM_TYPE_NEWPLACE, classes: ['item', 'child', 'hidden']},
    {label: 'Event', type: Globals.COMM_TYPE_NEWEVENT, classes: ['item', 'child', 'hidden']}
  ]},
  {label: 'Wikipedia', type: Globals.COMM_TYPE_NEWWIKI, classes: ['item']},
  {label: 'Link', type: Globals.COMM_TYPE_NEWLINK, classes: ['item']}
];

const editMenu = [
  {label: 'Delete', classes: ['item'], type: Globals.COMM_TYPE_DELETEASSOC}
];

const associationNames = new Map();
associationNames.set(Globals.COMM_TYPE_NEWCHAR, 'character');
associationNames.set(Globals.COMM_TYPE_NEWPLACE, 'place');
associationNames.set(Globals.COMM_TYPE_NEWEVENT, 'event');
associationNames.set(Globals.COMM_TYPE_NEWWIKI, 'wiki');
associationNames.set(Globals.COMM_TYPE_NEWLINK, 'link');

const lineSpacings = new Map();
lineSpacings.set('lineheight_single', 1);
lineSpacings.set('lineheight_medium', 1.5);
lineSpacings.set('lineheight_double', 2);

let blockOrder = {};

/**
 * Represents a document containing a work of fiction.
 */
export class Document extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);

    const dpi = this.getDPI();
    let width = 8.25 * dpi;
    let height = 11.75 * dpi;
    let docPadding = 1 * dpi;
    this.isMobile = false;
    if (navigator.userAgent.toLowerCase().match(/mobile/i)) {
      width = '100%';
      height = 'calc(100vh - 55px)';
      docPadding = '10px';
      this.isMobile = true;
    }
    this.state = {
      pageWidth: width,
      pageHeight: height,
      topMargin: docPadding,
      leftMargin: docPadding,
      rightMargin: docPadding,
      bottomMargin: docPadding,
      currentLineHeight: 'lineheight_double',
      leftOn: true,
      centerOn: false,
      rightOn: false,
      justifyOn: false,
      selectedText: '',
      associations: [],
      loading: true,
      selectedAssociation: '',
      editorState: null,
      dialogTitle: 'Message',
      dialogBody: 'No message set',
      dialogCancelFunc: null,
      dialogOKFunc: null,
      dialogIsPrompt: false,
      dialogOkButtonText: 'Ok',
      dialogCancelButtonText: 'Cancel',
      tabLength: 5
    };
    this.storyID = props.storyID;
    this.rightclickAddMenu = React.createRef();
    this.rightclickEditMenu = React.createRef();
    this.popPanel = React.createRef();
    this.maxWidth = this.state.pageWidth - (this.state.leftMargin + this.state.rightMargin);
    this.currentPage = 0;
    this.SAVE_TIME_INTERVAL = 10000;
    this.socket = null;
    this.deletePressed = false;
    this.pendingEdits = new Map();
    this.pendingDeletes = new Map();
    this.checkSaveInterval = setInterval(() => this.checkForPendingEditsOrDeletes(), this.SAVE_TIME_INTERVAL);
    this.editor = React.createRef();
    this.dialog = React.createRef();
    this.socketConnectionTerminated = false;
  }

  /**
   * proptypes for lint
   */
  static get propTypes() {
    return {
      storyID: PropTypes.string,
    };
  }

  /**
   * Trigger a Toasty alert
   *
   * @param {string} message
   * @param {Number} type
   */
  notify(message, type) {
    let func = toast;
    switch (type) {
      case Globals.TOASTTYPE_INFO:
        func = toast.info;
        break;
      case Globals.TOASTTYPE_ERROR:
        func = toast.error;
        break;
      case Globals.TOASTTYPE_SUCCESS:
        func = toast.success;
        break;
    }
    let toastPosition = toast.POSITION.BOTTOM_RIGHT;
    if (this.isMobile) {
      toastPosition = toast.POSITION.BOTTOM_CENTER;
    }
    func(message, {
      position: toastPosition
    });
  }

  /**
   * Configure the dialog component and display
   *
   * @param {string} title
   * @param {string} body
   * @param {bool} isPrompt
   * @param {function} okFunc
   * @param {function} cancelFunc
   * @param {string} okButtonText
   * @param {string} cancelButtonText
   */
  setupAndOpenDialog(title='', body='', isPrompt=false, okFunc=null, cancelFunc=null, okButtonText=null, cancelButtonText=null) {
    this.setState({
      dialogTitle: title,
      dialogBody: body,
      dialogIsPrompt: isPrompt,
      dialogOKFunc: okFunc,
      dialogOkButtonText: okButtonText,
      dialogCancelButtonText: cancelButtonText
    }, () => {
      this.dialog.current.setModalOpen(true);
    });
  }

  /**
   * Find entities in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {string} type
   */
  findEntity(contentBlock, callback, type) {
    contentBlock.findEntityRanges((character) => {
      const entityKey = character.getEntity();
      return (entityKey !== null && Entity.get(entityKey).getType() === type);
    }, callback);
  }


  /**
   * Create decorators from an array of text associations and
   * assign their click methods.
   *
   * @return {Object} The composite decorator
   */
  createDecorators() {
    const decorators = [];
    for (let i=0; i < this.state.associations.length; i++) {
      switch (this.state.associations[i].type) {
        case Globals.ASSOCIATION_TYPE_CHARACTER:
          decorators.push({
            strategy: this.findCharacters.bind(this),
            component: CharacterSpan,
            props: {
              leftclickFunc: this.clickedCharacter.bind(this),
              rightclickFunc: this.clickedCharacterContext.bind(this)
            }
          });
          break;
        case Globals.ASSOCIATION_TYPE_PLACE:
          decorators.push({
            strategy: this.findPlaces.bind(this),
            component: PlaceSpan,
            props: {
              leftclickFunc: this.clickedPlace.bind(this),
              rightclickFunc: this.clickedPlaceContext.bind(this)
            }
          });
          break;
        case Globals.ASSOCIATION_TYPE_EVENT:
          decorators.push({
            strategy: this.findEvents.bind(this),
            component: EventSpan,
            props: {
              leftclickFunc: this.clickedEvent.bind(this),
              rightclickFunc: this.clickedEventContext.bind(this)
            }
          });
          break;
      }
    }
    decorators.push({
      strategy: this.findTabs.bind(this),
      component: TabSpan
    });
    return new CompositeDecorator(decorators);
  }

  /**
   * Triggered when an association of type 'character' is clicked
   *
   * @param {string} label - the clicked-on text
   */
  clickedCharacter(label) {
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.popPanel.current.updateAndDisplay(assocObj[0].id);
  }

  /**
   * Triggered when clicking on 'new character' from the right-click
   * context menu while document text is highlighted.
   *
   * @param {event} event
   * @param {string} label - the selected text
   */
  clickedCharacterContext(event, label) {
    event.preventDefault();
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.setState({
      selectedAssociation: assocObj[0].id
    }, () => {
      this.rightclickEditMenu.current.updateAndDisplay(event.pageX, event.pageY);
    });
  }

  /**
   * Triggered when an association of type 'place' is clicked
   *
   * @param {string} label - the clicked-on text
   */
  clickedPlace(label) {
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.popPanel.current.updateAndDisplay(assocObj[0].id);
  }

  /**
   * Triggered when clicking on 'new place' from the right-click
   * context menu while document text is highlighted.
   *
   * @param {event} event
   * @param {string} label - the selected text
   */
  clickedPlaceContext(event, label) {
    event.preventDefault();
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.setState({
      selectedAssociation: assocObj[0].id
    }, () => {
      this.rightclickEditMenu.current.updateAndDisplay(event.pageX, event.pageY);
    });
  }

  /**
   * Triggered when an association of type 'event' is clicked
   *
   * @param {string} label - the clicked-on text
   */
  clickedEvent(label) {
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.popPanel.current.updateAndDisplay(assocObj[0].id);
  }

  /**
   * Triggered when clicking on 'new event' from the right-click
   * context menu while document text is highlighted.
   *
   * @param {event} event
   * @param {string} label - the selected text
   */
  clickedEventContext(event, label) {
    event.preventDefault();
    const assocObj = this.state.associations.filter((assoc) => {
      if (this.matchAlias(assoc, label)) {
        return assoc;
      }
      if (!assoc.details.caseSensitive) {
        return assoc.name.toLowerCase() == label.toLowerCase();
      }
      return assoc.name == label;
    });
    this.setState({
      selectedAssociation: assocObj[0].id
    }, () => {
      this.rightclickEditMenu.current.updateAndDisplay(event.pageX, event.pageY);
    });
  }

  /**
   * Check an association object for a matching alias property
   *
   * @param {Object} assoc
   * @param {string} label
   * @return {boolean}
   */
  matchAlias(assoc, label) {
    if (assoc.details.aliases.length) {
      const aliases = assoc.details.aliases.split(',');
      for (let i=0; i < aliases.length; i++) {
        if (!assoc.details.caseSensitive) {
          if (aliases[i].toLowerCase() == label.toLowerCase()) {
            return true;
          }
        }
        if (aliases[i] == label) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Generate the regex match string for associations.
   *
   * @param {string} string
   * @return {string}
   */
  getRegexString(string) {
    return '\\b' + string + '\\b';
  }

  /**
   * Find entities of type character in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {ContentState} contentState
   */
  findCharacters(contentBlock, callback, contentState ) {
    const text = contentBlock.getText();
    for (let i=0; i < this.state.associations.length; i++) {
      if (!this.state.associations[i].name.trim().length) {
        return;
      }
      if (this.state.associations[i].type == Globals.ASSOCIATION_TYPE_CHARACTER) {
        let match;
        const deets = this.state.associations[i].details;
        const name = this.state.associations[i].name.trim();
        const regexStr = this.getRegexString(name);
        let caseFlag = 'gm';
        if (!deets.caseSensitive) {
          caseFlag += 'i';
        }
        const regex = new RegExp(regexStr, caseFlag);
        while ((match = regex.exec(text)) !== null) {
          const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
          callback(start, start + name.length);
        }
        const toArray = deets.aliases.split(',');
        for (let z=0; z < toArray.length; z++) {
          const alias = toArray[z].trim();
          if (alias.length) {
            const regexStr = this.getRegexString(alias);
            const regex = new RegExp(regexStr, caseFlag);
            while ((match = regex.exec(text)) !== null) {
              const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
              callback(start, start + alias.length);
            }
          }
        }
      }
    }
  }

  /**
   * Find entities of type place in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {ContentState} contentState
   */
  findPlaces(contentBlock, callback, contentState ) {
    const text = contentBlock.getText();
    for (let i=0; i < this.state.associations.length; i++) {
      if (!this.state.associations[i].name.trim().length) {
        return;
      }
      if (this.state.associations[i].type == Globals.ASSOCIATION_TYPE_PLACE) {
        let match;
        const deets = this.state.associations[i].details;
        const name = this.state.associations[i].name.trim();
        const regexStr = this.getRegexString(name);
        let caseFlag = 'gm';
        if (!deets.caseSensitive) {
          caseFlag += 'i';
        }
        const regex = new RegExp(regexStr, caseFlag);
        while ((match = regex.exec(text)) !== null) {
          const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
          callback(start, start + name.length);
        }
        const toArray = deets.aliases.split(',');
        for (let z=0; z < toArray.length; z++) {
          const alias = toArray[z].trim();
          if (alias.length) {
            const regexStr = this.getRegexString(alias);
            const regex = new RegExp(regexStr, caseFlag);
            while ((match = regex.exec(text)) !== null) {
              const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
              callback(start, start + alias.length);
            }
          }
        }
      }
    }
  }

  /**
   * Find entities of type event in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {ContentState} contentState
   */
  findEvents(contentBlock, callback, contentState ) {
    const text = contentBlock.getText();
    for (let i=0; i < this.state.associations.length; i++) {
      if (!this.state.associations[i].name.trim().length) {
        return;
      }
      if (this.state.associations[i].type == Globals.ASSOCIATION_TYPE_EVENT) {
        let match;
        const deets = this.state.associations[i].details;
        const name = this.state.associations[i].name.trim();
        const regexStr = this.getRegexString(name);
        let caseFlag = 'gm';
        if (!deets.caseSensitive) {
          caseFlag += 'i';
        }
        const regex = new RegExp(regexStr, caseFlag);
        while ((match = regex.exec(text)) !== null) {
          const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
          callback(start, start + name.length);
        }

        const toArray = deets.aliases.split(',');
        for (let z=0; z < toArray.length; z++) {
          const alias = toArray[z].trim();
          if (alias.length) {
            const regexStr = this.getRegexString(alias);
            const regex = new RegExp(regexStr, caseFlag);
            while ((match = regex.exec(text)) !== null) {
              const start = match.index + match[0].length - match[0].replace(/^\s+/, '').length;
              callback(start, start + alias.length);
            }
          }
        }
      }
    }
  }

  /**
   * Find entities of type tab in block
   *
   * @param {ContentBlock} contentBlock
   * @param {function} callback
   * @param {ContentState} contentState
   */
  findTabs(contentBlock, callback, contentState) {
    contentBlock.findEntityRanges((character) => {
      const entityKey = character.getEntity();
      return (
        entityKey !== null &&
        contentState.getEntity(entityKey).getType() === 'TAB'
      );
    },
    callback);
  }

  /** componentDidMount **/
  componentDidMount() {
    this.setState({
      editorState: EditorState.createEmpty()
    });
    this.fetchWebsocketURL();
    window.addEventListener('beforeunload', this.beforeunload.bind(this));
    this.fetchAssociations().then( () => {
      console.log('got assocs', this.state.associations);
      console.log('fetching docs');
      this.fetchDocumentBlocks();
    }, (reason) => {
      console.log('no associations');
      this.fetchDocumentBlocks();
    });
  }

  /**
   * Prompt the user if tab close/refresh is detected and they have pending saves.
   *
   * @param {Event} event
   */
  beforeunload(event) {
    // There are pending saves to be written. Prompt user.
    let savePending = false;
    let deletePending = false;
    this.pendingEdits.forEach((value) => {
      if (value) {
        savePending = true;
      }
    });
    this.pendingDeletes.forEach((value) => {
      if (value) {
        deletePending = true;
      }
    });
    if (savePending || deletePending) {
      event.preventDefault();
      event.returnValue = true;
      return;
    }
    if (this.socket.isOpen) {
      this.socket.close();
    }
  }

  /**
   * Init websocket and assign handlers
   *
   * @param {string} url
   */
  setupWebsocket(url) {
    this.socket = new WebSocket(url);
    this.socket.isOpen = false;

    this.socket.onopen = (event) => {
      if (this.socketConnectionTerminated) {
        this.socketConnectionTerminated = false;
        this.notify('Connection restored.', Globals.TOASTTYPE_SUCCESS);
      }
      this.socket.isOpen = true;
      console.log('opened', this.socket);
    };
    this.socket.onclose = (event) => {
      console.log('socket closed', event);
      if (!this.socketConnectionTerminated) {
        this.socketConnectionTerminated = true;
        this.notify('Connection error. Any changes will not be saved.', Globals.TOASTTYPE_ERROR);
      }
      this.socket.isOpen = false;
      setTimeout(this.setupWebsocket.bind(this), 6000, url);
    };
    this.socket.onerror = (event) => {
      console.error('socket error', event);
    };
    this.socket.onmessage = (event) => {
      console.log('Message from server', JSON.parse(event.data));
      this.processSocketMessage(JSON.parse(event.data));
    };
  }

  /**
   * Force draftJS to redraw its decorators, needed for
   * when the list of associations is updated by the user.
   */
  forceRender() {
    const editorState = this.state.editorState;
    this.setState({editorState: EditorState.set(editorState, {decorator: this.createDecorators()})});
  }

  /**
   * parse and react to received websocket messages
   *
   * @param {JSON} message
   */
  processSocketMessage(message) {
    switch (message.command) {
      case 'pushAssociations': {
        let newAsses = [];
        if (message.data) {
          newAsses = message.data;
        }
        this.setState({
          associations: newAsses
        }, () => {
          // I have to obnoxiously trigger a re-render to get new associations to appear
          this.forceRender();
        });
        break;
      }
      case 'singleSaveSuccessful':
        this.pendingEdits.set(message.data.id, false);
        this.notify('Save successful.', Globals.TOASTTYPE_SUCCESS);
        break;
      case 'blockSaved': {
        if (message.data.block.order == -1) {
          this.notify('Save successful.', Globals.TOASTTYPE_SUCCESS);
          return;
        }
        let entityMap = [];
        const cblock = this.jsonToContentBlock(message.data.block);
        if (message.data.block.entities) {
          entityMap = this.jsonToEntityMap(message.data.block);
        }
        const contentState = this.state.editorState.getCurrentContent();
        const newBlockMap = contentState.getBlockMap().set(cblock.key, cblock);
        this.setState({
          editorState: EditorState.push(this.state.editorState, ContentState.createFromBlockArray(newBlockMap.toArray()))
        }, () => {
          this.processBlockEntities(entityMap);
        });
        break;
      }
      case 'blockSaveFailed':
        this.notify('ERROR: Save failed.', Globals.TOASTTYPE_ERROR);
        break;
      case 'singleDeletionSuccessful':
        this.pendingDeletes.set(message.data.id, false);
        this.notify('Save successful.', Globals.TOASTTYPE_SUCCESS);
        break;
      case 'singleSaveFailed':
      case 'singleDeletionFailed':
        this.notify('Save failed.', Globals.TOASTTYPE_ERROR);
        break;
      case 'fetchAssociationsFailed':
        this.setupAndOpenDialog('Error', message.data.text);
        break;
      case 'newAssociationFailed':
        this.setupAndOpenDialog('Error', message.data.text);
        break;
      case 'removeAssociationFailed':
        this.setupAndOpenDialog('Error', message.data.text);
        break;
    }
  }

  /**
   * Retrieve all associations from the API.
   *
   * @return {Promise}
   */
  fetchAssociations() {
    return new Promise((resolve, reject) => {
      fetch(Globals.SERVICE_URL + '/story/' + this.storyID + '/associations', {
        headers: Globals.getHeaders()
      }).then((response) => {
        switch (response.status) {
          case 200:
            response.json().then((data) => {
              this.setState({
                associations: data
              }, () => {
                resolve();
              });
            });
            break;
          default:
            reject();
        }
      });
    });
  }

  /**
   * Refresh page associations
   */
  redrawAssociations() {
    this.fetchAssociations();
  }

  /**
   * Convert a json contentblock from the server to a proper Draft ContentBlock
   *
   * @param {Array} item
   * @return {DraftContentBlock} item
   */
  jsonToContentBlock(item) {
    const configs = [];
    item.body.characterList.forEach((character) => {
      if (!character.style || !character.style.length) {
        configs.push(CharacterMetadata.create());
        return;
      }
      // entities are regenerated further down, so nullifying them here
      const config = {
        style: Immutable.OrderedSet(character.style),
        entity: null
      };
      configs.push(CharacterMetadata.create(config));
    });

    return new ContentBlock({
      characterList: Immutable.List(configs),
      key: item.body.key,
      text: item.body.text,
      type: item.body.type,
      data: Immutable.Map(item.body.data)
    });
  }

  /**
   * Convert contentblock mapped entities into array of DraftJS entities
   *
   * @param {Object} item
   * @return {Array}
   */
  jsonToEntityMap(item) {
    const entityMap = [];
    console.log('parsing', item.entities);
    const toObj = JSON.parse(item.entities);
    Object.keys(toObj).forEach((key) => {
      entityMap.push({'blockKey': item.body.key, 'instance': toObj[key].instance, 'position': toObj[key].position, 'length': parseInt(toObj[key].position) + parseInt(toObj[key].entityLength)});
    });
    return entityMap;
  }

  /**
   * Process the entity map and apply each to the document
   *
   * @param {map} entityMap
   */
  processBlockEntities(entityMap) {
    let counter = 0;
    entityMap.forEach((entity) => {
      counter++;
      const updatedContent = this.state.editorState.getCurrentContent();
      const newContentState = updatedContent.createEntity(entity.instance.type, entity.instance.mutability, entity.instance.data);
      const entityKey = newContentState.getLastCreatedEntityKey();
      const selection = SelectionState.createEmpty(entity.blockKey);
      const updatedSelection = selection.merge({
        anchorOffset: entity.position,
        focusOffset: entity.length
      });
      const contentStateWithEntity = Modifier.applyEntity(newContentState, updatedSelection, entityKey);
      this.setState({
        editorState: EditorState.push(this.state.editorState, contentStateWithEntity, 'apply-entity')
      }, () => {
        if (counter == entityMap.length) {
          this.forceRender();
        }
      });
    });
  }

  /**
   * gets all pages for a given document
   *
   * @return {Promise}
   */

  fetchDocumentBlocks() {
    return fetch(Globals.SERVICE_URL + '/story/' + this.storyID + '/blocks', {
      headers: Globals.getHeaders()
    }).then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            const newBlocks = [];
            let entityMap = [];
            data.forEach((item) => {
              newBlocks.push(this.jsonToContentBlock(item));
              if (item.entities) {
                entityMap = this.jsonToEntityMap(item);
              }
            });
            console.log('newb', newBlocks);
            const newContent = ContentState.createFromBlockArray(newBlocks);
            this.setState({
              editorState: EditorState.push(this.state.editorState, newContent)
            }, () => {
              this.processBlockEntities(entityMap);
            });
          });
          break;
        case 404: {
          break;
        }
      }
      this.setState({
        loading: false
      });
    }).catch((error) => {
      console.error('FetchDocumentBlocks Error:', error);
    });
  }

  /**
   * Get the full URL of the websocket from the API
   */
  fetchWebsocketURL() {
    fetch(Globals.SERVICE_URL + '/wsinit', {
      headers: Globals.getHeaders()
    }).then((response) => response.json()).then((data) => {
      this.setupWebsocket(data.url);
    }).catch((error) => {
      console.error('FetchWebsocketURLError:', error);
    });
  }

  /**
   * Get the current block element being selected
   *
   * @return {Node}
   */
  getSelectedBlockElement() {
    const selection = window.getSelection();
    if (selection.rangeCount == 0) {
      return null;
    }
    let node = selection.getRangeAt(0).startContainer;
    do {
      if (node.getAttribute && node.getAttribute('data-block') == 'true') {
        return node;
      }
      node = node.parentNode;
    } while (node !== null);
    return null;
  }

  /**
   * Remove a block element from the map, which will
   * remove it from the dom as well.
   *
   * @param {EditorState} editorState
   * @param {string} blockKey
   * @return {EditorState}
   */
  removeBlockFromMap(editorState, blockKey) {
    const contentState = editorState.getCurrentContent();
    const blockMap = contentState.getBlockMap();
    if (blockMap.has(blockKey)) {
      // clear out all entities on the block
      /*
      const selection = SelectionState.createEmpty(blockKey);
      const block = contentState.getBlockForKey(blockKey);
      const selectAll = selection.merge({
        anchorOffset: 0,
        focusOffset:block.getLength()
      });
      const contentStateWithEntitiesWiped = Modifier.applyEntity(
        contentState,
        selectAll,
        null
      );*/
      // remove the block
      const newBlockMap = blockMap.remove(blockKey);
      const newContentState = contentState.merge({
        blockMap: newBlockMap
      });
      return EditorState.push(editorState, newContentState, 'remove-range');
    }
    return editorState;
  }

  /**
   * Check if page's contents exceed maximum height and push it to the subsequent page,
   * creating one if necessary.
   *
   * @param {number} pageNumber
   * @param {boolean} renderedNewPage
   */
  async checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber, renderedNewPage) {
    const editor = this.editor.current;
    const maxHeight = this.state.pageHeight - this.state.topMargin - this.state.bottomMargin;
    if (editor.editorContainer.firstChild.firstChild.offsetHeight > maxHeight) {
      // later
    }
  }

  /**
   * Get styles of the preceding block
   *
   * @param {EditorState} editorState
   * @param {Selection} selection
   * @return {boolean}
   */
  getBlockStyles(editorState, selection) {
    const block = editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
    const data = block.getData();
    const styles = {};
    const storedAlignment = data.getIn(['alignment']);
    let alignment = 'left';
    if (storedAlignment) {
      alignment = storedAlignment;
    }
    styles.direction = alignment;
    const storedLineHeight = data.getIn(['lineHeight']);
    let lineHeight = 'lineheight_single';
    if (storedLineHeight) {
      lineHeight = storedLineHeight;
    }
    styles.lineHeight = lineHeight;
    return styles;
  }

  /**
   * Make an empty string to be used as a tab character
   * based on user settings value.
   * @return {string}
   */
  generateTabCharacter() {
    let tab = '';
    for (let i=0; i < this.state.tabLength; i++) {
      tab += ' ';
    }
    return tab;
  }

  /**
   * insert a TAB entity
   *
   * @param {EditorState} editorState
   * @return {EditorState}
   */
  insertTab(editorState) {
    console.log('inserting tab');
    const currentContent = editorState.getCurrentContent();
    const selection = editorState.getSelection();
    const contentStateWithEntity = currentContent.createEntity('TAB', 'IMMUTABLE');
    const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
    const textWithEntity = Modifier.insertText(currentContent, selection, this.generateTabCharacter(), null, entityKey);
    this.pendingEdits.set(selection.getFocusKey(), true);
    return EditorState.push(editorState, textWithEntity, 'insert-characters');
  }

  /**
   * Fires on every DraftJS keystroke or cursor change
   *
   * @param {EditorState} newEditorState
   * @param {number} pageNumber
   */
  async onChange(newEditorState) {
    let cursorChange = false;
    let saveAllRequired = false;
    let pastedEdits = false;
    const selection = newEditorState.getSelection();
    // Cursor has moved but no text changes detected.
    if (this.state.editorState.getCurrentContent() === newEditorState.getCurrentContent()) {
      cursorChange = true;
      const lastBlock = newEditorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
      if (lastBlock) {
        const lastData = lastBlock.getData();
        this.updateTextControls(lastData.getIn(['alignment']));
        const lineHeight = lastData.getIn(['lineHeight']);
        this.updateTextControls(lineHeight);
      }
    }
    let filterToSaveResults;
    // text was pasted
    if (this.pastedText) {
      this.pastedText = false;
      const oldBlockMap = this.state.editorState.getCurrentContent().getBlockMap();
      const newBlockMap = newEditorState.getCurrentContent().getBlockMap();
      // if new content has blocks that aren't present in the old content, we should add them
      filterToSaveResults = new Map([...newBlockMap].filter(([k, v]) => ![...oldBlockMap].includes(k)));
      console.log('save', filterToSaveResults);
      // if old content has blocks that are no longer present in the new content, we should delete them.
      //filterToDeleteResults = new Map([...oldBlockMap].filter(([k, v]) => ![...newBlockMap].includes(k)));
      if (filterToSaveResults.size > 10) {
        this.notify('Crazy long paste detected, working on it...', Globals.TOASTTYPE_INFO);
        saveAllRequired = true;
      } else {
        pastedEdits = true;
      }
    }

    let selectedBlocks;
    if (this.deletePressed) {
      this.deletePressed = false;
      selectedBlocks = this.getSelectedBlocksMap(newEditorState);
    }

    const dataMap = [];
    const blockTree = this.state.editorState.getBlockTree(selection.getFocusKey());
    if (!blockTree && !saveAllRequired) {
      // a new block has been added, copy styles from previous block
      const prevSelection = newEditorState.getCurrentContent().getSelectionBefore();
      const styles = this.getBlockStyles(newEditorState, prevSelection);
      dataMap.push(['alignment', styles.direction]);
      dataMap.push(['lineHeight', styles.lineHeight]);
      const iMap = Immutable.Map(dataMap);
      const nextContentState = Modifier.mergeBlockData(newEditorState.getCurrentContent(), selection, iMap);
      newEditorState = EditorState.push(newEditorState, nextContentState, 'change-block-data');
      // auto tab if align left
      if (styles.direction == 'left' || !styles.direction) {
        newEditorState = this.insertTab(newEditorState);
      }
      console.log('new block added', styles);
    }

    this.setState({
      editorState: newEditorState
    }, () => {
      if (!cursorChange && !saveAllRequired) {
        const content = newEditorState.getCurrentContent();
        const block = content.getBlockForKey(selection.getAnchorKey());
        // await this.checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber);
        this.pendingEdits.set(block.getKey(), true);
      }
      if (saveAllRequired) {
        this.saveAllBlocks(newEditorState);
      }
      if (pastedEdits) {
        filterToSaveResults.forEach((saveBlock) => {
          this.pendingEdits.set(saveBlock.getKey(), true);
        });
      }
      if (selectedBlocks) {
        selectedBlocks.forEach((currentSelectionBlock, key) => {
          const newContentState = this.state.editorState.getCurrentContent();
          const affectedBlock = newContentState.getBlockForKey(key)
          if (affectedBlock) {
            console.log('rem text', affectedBlock.getText());
          }
          if (affectedBlock && !affectedBlock.getText().length) {
            this.setState({
              editorState: this.removeBlockFromMap(this.state.editorState, key)
            }, () => {
              this.pendingDeletes.set(key, true);
            });
          } else if (!affectedBlock) {
            this.pendingDeletes.set(key, true);
          }
        });
      }
    });
  }

  /**
   * Scroll to the currently selected block element
   */
  scrollToBlock() {
    const blockDOM = this.getSelectedBlockElement();
    if (blockDOM) {
      const domY = blockDOM.getBoundingClientRect().top;
      if (Math.abs(domY - window.scrollY) > 400) {
        const scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
      }
    }
  }

  /**
   * Check stored action arrays for upcoming writes
   *
   * @param {boolean} userInitiated
   */
  checkForPendingEditsOrDeletes(userInitiated) {
    let saveRequired = false;
    this.pendingDeletes.forEach((value, key) => {
      if (value) {
        saveRequired = true;
        this.deleteBlock(key);
        this.pendingEdits.delete(key);
      }
    });
    this.pendingEdits.forEach((value, key) => {
      if (value) {
        saveRequired = true;
        this.saveBlock(key);
      }
    });
    if (!saveRequired && userInitiated) {
      this.notify('No changes detected.', Globals.TOASTTYPE_INFO);
    }
  }

  /**
   * Save every single block
   * this is a temp fix for pasting in text until I can figure out
   * how to target pasted blocks individually
   *
   * @param {EditorState} editorState
   */
  saveAllBlocks(editorState) {
    if (this.socket.isOpen) {
      this.notify('Saving...', Globals.TOASTTYPE_INFO);
      const contentState = this.state.editorState.getCurrentContent();
      this.socket.send(JSON.stringify({command: 'saveAllBlocks', data: {other: {storyID: this.storyID, body: convertToRaw(contentState)}}}));
      this.setState({
        editorState: EditorState.push(editorState, ContentState.createFromText(''))
      });
    }
  }

  /**
   * Send command via websocket save specific page
   *
   * @param {string} key
   */
  saveBlock(key) {
    // Send the encoded block if the socket is open and it hasn't been subsequently deleted
    if (this.socket.isOpen) {
      const block = this.state.editorState.getCurrentContent().getBlockForKey(key);
      console.log('save block', block);
      if (block) {
        this.notify('Saving...', Globals.TOASTTYPE_INFO);
        const entities = new Map();
        let lastKey;
        for (let i=0; i < block.getLength(); i++) {
          const entKey = block.getEntityAt(i);
          if (entKey) {
            if (entKey != lastKey) {
              entities[entKey] = {};
              entities[entKey].instance = this.state.editorState.getCurrentContent().getEntity(entKey);
              entities[entKey].position = i;
              entities[entKey].entityLength = 1;
              lastKey = entKey;
            } else {
              entities[entKey].entityLength++;
            }
          }
        }
        const blockMap = this.state.editorState.getCurrentContent().getBlockMap();
        const blockPosition = blockMap.keySeq().findIndex(k => k === key);
        this.socket.send(JSON.stringify({command: 'saveBlock', data: {block: {key: block.getKey(), order: blockPosition, storyID: this.storyID, body: block.toJSON(), entities: JSON.stringify(entities)}}}));
        this.saveBlockOrder();
      }
    }
  }

  /**
   * Save the ordered state of the block map to mongo
   */
  saveBlockOrder() {
    try {
      const order = this.state.editorState.getCurrentContent().getBlocksAsArray();
      const toObj = {};
      for (let i=0; i < order.length; i++) {
        toObj[order[i].key] = i;
      }
      if (blockOrder != JSON.stringify(toObj)) {
        console.log('writing block order to db');
        blockOrder = JSON.stringify(toObj);
        this.socket.send(JSON.stringify({command: 'updateBlockOrder', data: {other: {storyID: this.storyID, order: toObj}}}));
      }
    } catch (error) {
      console.error('SaveBlockOrderError', error);
    }
  }

  /**
   * Send command via websocket to delete given page
   *
   * @param {number} key
   */
  deleteBlock(key) {
    console.log('deleting block', key);
    if (this.socket.isOpen) {
      this.notify('Saving...', Globals.TOASTTYPE_INFO);
      this.socket.send(JSON.stringify({command: 'deleteBlock', data: {block: {key: key, storyID: this.storyID}}}));
      this.saveBlockOrder();
    }
  }

  /**
   * Get user's resolution based on device DPI
   *
   * @return {number} resolution
   */
  getDPI() {
    let i=56;
    for (i = 56; i < 2000; i++) {
      if (matchMedia('(max-resolution: ' + i + 'dpi)').matches === true) {
        return i;
      }
    }
    return i;
  }

  /**
   * return a string for specific key presses or combinations
   *
   * @param {event} event
   * @return {string}
   */
  keyBindings(event) {
    // tab pressed
    if (event.keyCode == 9) {
      event.preventDefault();
      this.setState({
        editorState: this.insertTab(this.state.editorState)
      });
    }
    // console.log('key', event.keyCode);
    if (event.ctrlKey) {
      if (event.keyCode == 83) {
        return 'ctrl_s';
      }
      if (event.keyCode == 190) {
        return 'ctrl_>';
      }
      if (event.keyCode == 188) {
        return 'ctrl_<';
      }
      if (event.keyCode == 86) {
        this.pastedText = true;
      }
    }
    return getDefaultKeyBinding(event);
  }

  /**
   * Calls for specific keypresses
   *
   * @param {string} command
   * @param {number} pageNumber
   */
  handleKeyCommand(command) {
    console.log('cmd', command.toLowerCase());
    switch (command.toLowerCase()) {
      case 'delete':
      case 'backspace': {
        console.log('hit delete');
        this.deletePressed = true;
        this.onChange(this.state.editorState);
        break;
      }
      case 'bold':
      case 'italic':
      case 'underline': {
        this.setState({
          editorState: RichUtils.toggleInlineStyle(this.state.editorState, command.toUpperCase())
        }, () => {
          this.pendingEdits.set(this.state.editorState.getSelection().getFocusKey(), true);
        });
        break;
      }
      case 'ctrl_s':
        this.checkForPendingEditsOrDeletes(true);
        break;
      case 'ctrl_v':
        break;
    }
  }

  /**
   * Set focus to passed Draft element
   * @param {number} index
   */
  setFocus(index) {
    // console.log('focus on', index);
    this.currentPage = index;
    this.editor.current.focus();
    if (this.rightclickAddMenu.current.IsOpen) {
      this.rightclickAddMenu.current.hide();
    }
    if (this.rightclickEditMenu.current.IsOpen) {
      this.rightclickEditMenu.current.hide();
    }
    if (this.popPanel.current.IsOpen) {
      this.popPanel.current.hide();
    }
  }
  
  /**
   * Function returns collection of currently selected blocks.
   *
   * @param {EditorState} editorState
   * @param {Map}
   */
  getSelectedBlocksMap(editorState) {
    const selectionState = editorState.getSelection();
    const contentState = editorState.getCurrentContent();
    
    const startKey = selectionState.getStartKey();
    const endKey = selectionState.getEndKey();
    console.log('start', startKey, 'end', endKey);
    const blockMap = contentState.getBlockMap();
    console.log('blmp', blockMap);
    return blockMap
      .skipUntil((_, k) => k === startKey)
      .takeUntil((_, k) => k === endKey)
      .concat([[endKey, blockMap.get(endKey)]]);
  }

  /**
   * Toggle states of text controls based on current block style
   * @param {string} style
   */
  updateTextControls(style) {
    if (lineSpacings.has(style)) {
      this.setState({
        currentLineHeight: style
      });
      return;
    }

    let l=true;
    let c=false;
    let r=false;
    let j=false;
    switch (style) {
      case 'center':
        l = false;
        c = true;
        r = false;
        j = false;
        break;
      case 'right':
        l = false;
        c = false;
        j = false;
        r = true;
        break;
      case 'justify':
        l = false;
        r = false;
        c = false;
        j = true;
        break;
    }
    this.setState({
      leftOn: l,
      centerOn: c,
      rightOn: r,
      justifyOn: j
    });
  }

  /**
   * get block css styles from block metadata
   *
   * @param {Block} contentBlock
   * @return {string} classStr
   */
  generateBlockStyle(contentBlock) {
    let classStr = '';
    const data = contentBlock.getData();
    const alignment = data.getIn(['alignment']);
    if (alignment) {
      classStr += 'align_' + data.getIn(['alignment']);
    }
    const lineHeight = data.getIn(['lineHeight']);
    if (lineHeight) {
      if (classStr.length) {
        classStr += ' ';
      }
      classStr += lineHeight;
    }
    return classStr;
  }

  /**
   * Update the current block's alignment based on button click
   *
   * @param {string} style
   * @param {event} event
   */
  updateTextAlignment(style, event) {
    event.preventDefault();
    const selection = this.state.editorState.getSelection();
    const nextContentState = Modifier.mergeBlockData(this.state.editorState.getCurrentContent(), selection, Immutable.Map([['alignment', style]]));
    this.updateTextControls(style);
    this.setState({
      editorState: EditorState.push(this.state.editorState, nextContentState, 'change-block-data')
    }, () => {
      const block = nextContentState.getBlockForKey(selection.getAnchorKey());
      this.pendingEdits.set(block.getKey(), true);
    });
  }

  /**
   * Update the current block's line-height based on button click
   *
   * @param {event} event
   */
  updateLineHeight(event) {
    event.preventDefault();
    const clicked = event.target.dataset.height;
    let nextSpacing = 'lineheight_single';
    let prevMatch = false;
    let key;
    for ([key] of lineSpacings) {
      if (key == clicked) {
        prevMatch = true;
        continue;
      }
      if (prevMatch) {
        nextSpacing = key;
        break;
      }
    }
    const selection = this.state.editorState.getSelection();
    const newState = EditorState.forceSelection(this.state.editorState, selection);
    const nextContentState = Modifier.mergeBlockData(this.state.editorState.getCurrentContent(), selection, Immutable.Map([['lineHeight', nextSpacing]]));
    this.setState({
      editorState: EditorState.push(newState, nextContentState, 'change-block-data'),
      currentLineHeight: nextSpacing
    }, () => {
      const content = this.state.editorState.getCurrentContent();
      const block = content.getBlockForKey(selection.getAnchorKey());
      this.pendingEdits.set(block.getKey(), true);
    });
  }

  /**
   * Handler for right-click event
   *
   * @param {Event} event
  **/
  onRightClick(event) {
    const text = this.getSelectedText(this.state.editorState);
    if (text.length) {
      event.preventDefault();
      this.setState({selectedText: text});
      this.rightclickAddMenu.current.updateAndDisplay(event.pageX, event.pageY);
    }
  }

  /**
   * Get the current selected (highlighted) text
   *
   * @param {Object} editorState
   * @return {String} selectedText
  **/
  getSelectedText(editorState) {
    const selection = editorState.getSelection();
    const anchorKey = selection.getAnchorKey();
    const currentContent = editorState.getCurrentContent();
    const currentBlock = currentContent.getBlockForKey(anchorKey);

    const start = selection.getStartOffset();
    const end = selection.getEndOffset();
    const selectedText = currentBlock.getText().slice(start, end);
    return selectedText;
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    if (this.state.loading) {
      return (<div>loading...</div>);
    } else {
      return (
        <div style={{'position': 'relative'}}>
          <nav className="docControls">
            <ul style={{width: this.state.pageWidth}}>
              <li><FormatAlignLeftIcon fontSize="inherit" className={this.state.leftOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('left', e)}/></li>
              <li><FormatAlignCenterIcon fontSize="inherit" className={this.state.centerOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('center', e)}/></li>
              <li><FormatAlignRightIcon fontSize="inherit" className={this.state.rightOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('right', e)}/></li>
              <li><FormatAlignJustifyIcon fontSize="inherit" className={this.state.justifyOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('justify', e)} /></li>
              <li style={{'paddingTop': '2px'}}>
                <span>
                  <FormatLineSpacingIcon data-height={this.state.currentLineHeight} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateLineHeight(e)}/>
                  <span>{lineSpacings.get(this.state.currentLineHeight)}</span>
                </span>
              </li>
            </ul>
          </nav>
          <div className="editorRoot" style={{width: this.state.pageWidth}}>
            <div onClick={this.focus} className="editorContainer">
              <section onContextMenu={(e)=> {this.onRightClick(e);}} onClick={() => {this.setFocus();}} className="margins" style={{minHeight: this.state.pageHeight, paddingLeft: this.state.leftMargin, paddingRight: this.state.rightMargin, paddingTop: this.state.topMargin, paddingBottom: this.state.bottomMargin}}>
                <Editor
                  editorState={this.state.editorState}
                  handleKeyCommand={(command) => {
                    this.handleKeyCommand(command);
                  }}
                  keyBindingFn={this.keyBindings.bind(this)}
                  placeholder="Write something..."
                  blockStyleFn={this.generateBlockStyle.bind(this)}
                  onChange={this.onChange.bind(this)}
                  ref={this.editor}/>
              </section>
            </div>
          </div>
          <CustomContext ref={this.rightclickAddMenu} type="add" items={JSON.stringify(addMenu)} selected={this.state.selectedText} socket={this.socket} storyID={this.storyID}/>
          <CustomContext ref={this.rightclickEditMenu} type="edit" items={JSON.stringify(editMenu)} editingID={this.state.selectedAssociation} socket={this.socket} storyID={this.storyID}/>
          <PopPanel ref={this.popPanel} label="" storyID={this.storyID} onUpdateAssociationComplete={this.redrawAssociations.bind(this)}/>
          <ToastContainer />
          <DialogPrompt ref={this.dialog} title={this.state.dialogTitle} body={this.state.dialogBody} isPrompt={this.state.dialogIsPrompt} okFunc={this.state.dialogOKFunc} cancelFunc={this.state.dialogCancelFunc} okButtonText={this.state.dialogOkButtonText} cancelButtonText={this.state.dialogCancelButtonText}/>
        </div>
      );
    }
  }
}

const CharacterSpan = (props) => {
  return (
    <span onClick={(e)=> {props.leftclickFunc(props.decoratedText);}} onContextMenu={(e)=> {props.rightclickFunc(e, props.decoratedText);}} className="highlight character">
      {props.children}
    </span>
  );
};

const PlaceSpan = (props) => {
  return (
    <span onClick={(e)=> {props.leftclickFunc(props.decoratedText);}} onContextMenu={(e)=> {props.rightclickFunc(e, props.decoratedText);}} className="highlight place">
      {props.children}
    </span>
  );
};

const EventSpan = (props) => {
  return (
    <span onClick={(e)=> {props.leftclickFunc(props.decoratedText);}} onContextMenu={(e)=> {props.rightclickFunc(e, props.decoratedText);}} className="highlight event">
      {props.children}
    </span>
  );
};

const TabSpan = (props) => {
  return (
    <span className="tabEntity">{props.children}</span>
  );
};

CharacterSpan.propTypes = PlaceSpan.propTypes = EventSpan.propTypes = {
  leftclickFunc: PropTypes.func,
  rightclickFunc: PropTypes.func,
  decoratedText: PropTypes.string,
  children: PropTypes.array
};

TabSpan.propTypes = {
  children: PropTypes.array
};
