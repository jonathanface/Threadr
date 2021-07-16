import React from 'react';
import {Globals} from './Globals.jsx';
import {DialogPrompt} from './DialogPrompt.jsx';
import {CornerMenu} from './CornerMenu.jsx';
import {Document} from './Document.jsx';
import DeleteForever from '@material-ui/icons/DeleteForever';

/**
 * The main page of the whole darned site
 */
export class Landing extends React.Component {
  /** constructor **/
  constructor() {
    super();
    this.isLoggedIn = false;
    this.editingTitle = false;
    this.fetchedStories = false;
    this.state = {
      username: '',
      stories: [],
      greeting: '',
      addStoryButtonDisplay: 'none',
      editingDocument: false,
      dialogTitle: 'Message',
      dialogBody: 'No message set',
      dialogCancelFunc: null,
      dialogOKFunc: null,
      dialogIsPrompt: true,
      dialogOkButtonText: 'Ok',
      dialogCancelButtonText: 'Cancel',
      dialogIsConfirm: false,
      dialogTextFieldLabel: '',
      dialogDefaultPromptText: ''
    };
    this.dialog = React.createRef();
  }

  /** componentDidMount **/
  componentDidMount() {
    window.addEventListener('popstate', this.handleOnUrlChange, false);
    if (this.isLoggedIn) {
      this.setState({
        greeting: ''
      });
    }
  }

  /** componentWillUnmount **/
  componentWillUnmount() {
    window.removeEventListener('popstate', this.handleOnUrlChange, false);
  }

  /**
   * Fire whenever the window location changes
   *
   * @param {Event} event
   */
  handleOnUrlChange = (event) => {
    const location = window.location.href;
    const splitUp = location.split('/');
    let requestedDocument = false;
    for (let i=splitUp.length-1; i >=0; i--) {
      if (splitUp[i] == 'story') {
        if (splitUp[i+1]) {
          requestedDocument = splitUp[i+1];
        }
        break;
      }
    }
    let displayState = 'initial';
    if (requestedDocument) {
      displayState = 'none';
    } else {
      this.getAllStories();
    }
    this.setState({
      addStoryButtonDisplay: displayState,
      editingDocument: requestedDocument
    });
  }

  /**
   * Return all user stories
   *
   * @return {Promise}
   */
  fetchDocuments() {
    return fetch(Globals.SERVICE_URL + '/stories', {
      method: 'GET',
      headers: Globals.getHeaders()
    });
  }

  /**
   * Return user details from google signin claims.
   *
   * @return {Promise}
   */
  fetchUserDetails() {
    return fetch(Globals.SERVICE_URL + '/user/name', {
      method: 'GET',
      headers: Globals.getHeaders()
    });
  }

  /**
   * User has selected a document to open
   *
   * @param {Event} event
   */
  enterDocument(event) {
    event.stopPropagation();
    setTimeout(() => {
      if (!this.editingTitle) {
        let selectedID;
        !event.target.dataset.id ? selectedID = event.target.parentElement.dataset.id : selectedID = event.target.dataset.id;
        if (selectedID) {
          history.pushState({}, '', '/story/' + selectedID);
          this.setState({
            editingDocument: selectedID,
            addStoryButtonDisplay: 'none',
          });
        }
      }
    }, 300);
  }

  /**
   * Callback triggered by a failed login to Google
   */
  handleLoginFailure() {
    console.log('fail');
    this.setState({
      greeting: 'You have to login, stupid.'
    });
    this.isLoggedIn = false;
  }

  /**
   * Callback triggered by a successful login to Google
   */
  handleLogin() {
    console.log('login');
    this.isLoggedIn = true;
    this.fetchUserDetails().then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            this.setState({
              username: data.given_name,
              greeting: ''
            });
            this.handleOnUrlChange(null);
          });
          break;
        default:
          this.setupAndOpenDialog('Error', 'Unable to log you in at this time.', false, null, null, 'OKAY');
      }
    });
    if (!this.fetchedStories) {
      this.getAllStories();
    }
  }

  /**
   * Fetch all user stories from the DB
   */
  getAllStories() {
    this.fetchedStories = true;
    this.fetchDocuments().then((response) => {
      switch (response.status) {
        case 200:
          this.setState({
            stories: []
          }, () => {
            response.json().then((data) => {
              this.renderStoryButton(data);
            });
          });
          break;
        default:
          this.setupAndOpenDialog('Error', 'There was an error retrieving your stories.', false, null, null, 'OKAY');
      }
    });
  }

  /**
   * Draw a clickable, editable icon representing a document
   * for each story.
   *
   * @param {Object} data
   */
  renderStoryButton(data) {
    const receivedStories = this.state.stories;
    for (const story of data) {
      const t = Date.parse(story.lastAccessed)/1000;
      receivedStories.push(<li key={story.id} data-id={story.id} data-last-accessed={t}>
        <div onClick={this.enterDocument.bind(this)} className="bg"></div>
        <div className="title" onClick={this.enterDocument.bind(this)} onDoubleClick={this.titleDoubleClicked.bind(this)} onKeyPress={this.titleEdited.bind(this)} onBlur={this.titleEditedLoseFocus.bind(this)} onFocus={this.selectAllTitle} contentEditable="true">{story.title}</div>
        <button onClick={this.promptToDeleteStory.bind(this)}>
          <DeleteForever />
        </button>
      </li>);
    }
    let newGreeting = 'You haven\'t begun any stories yet...';
    if (receivedStories.length) {
      newGreeting = '';
    }
    this.setState({
      stories: receivedStories,
      greeting: newGreeting
    });
  }

  /**
   * Callback triggered by a successful logout from Google
   */
  handleLogout() {
    const blankStories = [];
    this.isLoggedIn = false;
    this.setState({
      editingDocument: false,
      stories: blankStories,
      addStoryButtonDisplay: 'none',
      username: '',
      greeting: ''
    });
    history.pushState({}, '', '/');
  }

  /**
   * delete a story for all eternity, PURGE IT FROM THE VERY FABRIC OF THE UNIVERSE
   *
   * @param {string} id
   */
  deleteStory(id) {
    this.dialog.current.setModalOpen(false);
    fetch(Globals.SERVICE_URL + '/story/' + id, {
      method: 'DELETE',
      headers: Globals.getHeaders()
    }).then((response) => {
      switch (response.status) {
        case 200:
          this.getAllStories();
          break;
        default:
          this.setupAndOpenDialog('Error', 'There was an error deleting your story.', false, null, null, 'OKAY');
      }
    });
  }

  /**
   * warn/prompt about deleting a story
   *
   * @param {Event} event
   */
  promptToDeleteStory(event) {
    event.stopPropagation();
    const id = event.target.parentElement.dataset.id;
    const title = document.querySelector('.stories [data-id="' + id + '"] .title').innerText;
    this.setupAndOpenDialog('Delete ' + title + '?', 'This is undoable.', true, this.deleteStory.bind(this, id), null, 'DO IT');
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
   * stop an event
   *
   * @param {Event} event
   */
  captureAndKill(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  /**
   * Capture the click event on the contenteditable to stop it from propagating
   *
   * @param {Event} event
   */
  titleDoubleClicked(event) {
    event.stopPropagation();
    event.preventDefault();
    this.editingTitle = true;
    event.target.classList.add('active');
  }

  /**
   * Select all content inside the given element.
   * Should be captured from element onfocus
   *
   * @param {Event} event
   */
  selectAllTitle(event) {
    event.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(event.target);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Triggered by editing a story's title
   *
   * @param {event} event
   */
  titleEdited(event) {
    console.log('edited!!!', event);
    event.stopPropagation();
    this.editingTitle = true;
    if (event.keyCode == 13 || event.which == 13) {
      event.preventDefault();
      this.editingTitle = false;
      event.target.classList.remove('active');
    }
    const newTitle = event.target.innerText;
    fetch(Globals.SERVICE_URL + '/story/' + event.target.parentElement.dataset.id + '/title', {
      method: 'PUT',
      headers: Globals.getHeaders(),
      body: JSON.stringify({title: newTitle})
    }).then(() => {
      this.getAllStories();
    });
  }

  /**
   * Blur event on cursor out of story title field
   *
   * @param {Event} event
   */
  titleEditedLoseFocus(event) {
    event.keyCode = 13;
    this.titleEdited(event);
  }

  saveNewStory(event) {
    const newTitle = this.dialog.current.state.defaultFieldValue;
    if (!newTitle.length) {
      return;
    }
    fetch(Globals.SERVICE_URL + '/story', {
      method: 'POST',
      headers: Globals.getHeaders(),
      body: JSON.stringify({title: newTitle})
    }).then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            this.renderStoryButton(data);
          });
          break;
        default:
          this.setupAndOpenDialog('Error', 'Unable to create your story.', false, null, null, 'OKAY');
      }
    });
    this.dialog.current.setModalOpen(false);
  }

  /**
   * Prompt the user to enter a story title and call save if ok is clicked
   */
  createNewStory() {
    this.setState({
      dialogTitle: 'New Story',
      dialogBody: '',
      dialogIsPrompt: false,
      dialogIsConfirm: true,
      dialogTextFieldLabel: 'Title',
      dialogOKFunc: this.saveNewStory.bind(this),
      dialogDefaultPromptText: Globals.generateStoryTitle()
    }, () => {
      this.dialog.current.setModalOpen(true);
    });
  }

  /**
   * render
   * @return {element}
   */
  render() {
    let content = <ul className="stories">{this.state.stories}</ul>;
    if (this.state.editingDocument) {
      content = <Document storyID={this.state.editingDocument} />;
    }
    return (
      <div>
        <div style={{'position': 'fixed'}, {'width': '100%'}}>
          <CornerMenu displayName={this.state.username} logoutComplete={this.handleLogout.bind(this)} loginComplete={this.handleLogin.bind(this)} loginFailed={this.handleLoginFailure.bind(this)}/>
        </div>
        <div className="story_manager">
          { this.isLoggedIn ?
              <div><span>{this.state.greeting}</span><button onClick={this.createNewStory.bind(this)} style={{'display': this.state.addStoryButtonDisplay}}>+</button></div> :
              <span>{this.state.greeting}</span>
          }
        </div>
        <div>
          {content}
        </div>
        <DialogPrompt ref={this.dialog} title={this.state.dialogTitle} body={this.state.dialogBody} isPrompt={this.state.dialogIsPrompt} defaultFieldValue={this.state.dialogDefaultPromptText} isConfirm={this.state.dialogIsConfirm} textFieldLabel={this.state.dialogTextFieldLabel} okFunc={this.state.dialogOKFunc} cancelFunc={this.state.dialogCancelFunc} okButtonText={this.state.dialogOkButtonText} cancelButtonText={this.state.dialogCancelButtonText}/>
      </div>
    );
  }
}
