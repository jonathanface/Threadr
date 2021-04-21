import React from 'react';
import {Globals} from './Globals.jsx';
import {CornerMenu} from './CornerMenu.jsx';
import {Document} from './Document.jsx';

/**
 * The main page of the whole darned site
 */
export class Landing extends React.Component {
  /** constructor **/
  constructor() {
    super();
    this.isLoggedIn = false;
    this.state = {
      username: '',
      stories: [],
      greeting: '',
      addStoryButtonDisplay: 'none',
      editingDocument: false
    };
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
    if (!requestedDocument) {
      this.setState({
        addStoryButtonDisplay: 'initial',
        editingDocument: requestedDocument
      });
    } else {
      this.setState({
        addStoryButtonDisplay: 'none',
        editingDocument: requestedDocument
      });
    }
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
    console.log('clicked ' + event.target.dataset.id);
    history.pushState({}, '', '/story/' + event.target.dataset.id);
    this.setState({
      editingDocument: event.target.dataset.id,
      addStoryButtonDisplay: 'none',
    });
  }

  /**
   * Callback triggered by a failed login to Google
   */
  handleLoginFailure() {
    console.log('fail');
    this.isLoggedIn = false;
  }

  /**
   * Callback triggered by a successful login to Google
   */
  handleLogin() {
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
          this.setState({
            greeting: ''
          });
      }
    });
    this.fetchDocuments().then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            const receivedStories = [];
            for (const story of data) {
              const t = Date.parse(story.lastAccessed)/1000;
              receivedStories.push(<li onClick={this.enterDocument.bind(this)} onInput={this.titleEdited.bind(this)} contentEditable="true" key={story.id} data-id={story.id} data-last-accessed={t}>{story.title}</li>);
            }
            let newGreeting = 'You haven\'t begun any stories yet...';
            if (receivedStories.length) {
              newGreeting = '';
            }
            this.setState({
              stories: receivedStories,
              greeting: newGreeting
            });
          });
          break;
      }
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
   * Triggered by editing a story's title
   *
   * @param {event} event
   */
  titleEdited(event) {
    const newTitle = event.target.innerText;
    fetch(Globals.SERVICE_URL + '/story/' + event.target.dataset.id + '/title', {
      method: 'PUT',
      headers: Globals.getHeaders(),
      body: JSON.stringify({title: newTitle})
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
          <span>{this.state.greeting}</span><button style={{'display': this.state.addStoryButtonDisplay}}>+</button>
        </div>
        <div>
          {content}
        </div>
      </div>
    );
  }
}
