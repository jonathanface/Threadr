import React from 'react';
import {Globals} from './Globals.jsx';
import {Menu} from './Menu.jsx';

/**
 * The main page of the whole darned site
 */
export class Landing extends React.Component {
  /** constructor **/
  constructor() {
    super();
    this.state = {
      username: '',
      stories: [],
      greeting: 'Login up top to get started',
      addStoryButtonDisplay: 'none'
    };
  }

  /** componentDidMount **/
  componentDidMount() {
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
  }

  /**
   * Callback triggered by a successful login to Google
   */
  handleLogin() {
    this.fetchUserDetails().then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            this.setState({
              username: data.given_name
            });
          });
          break;
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
    this.setState({
      stories: blankStories,
      greeting: 'Login up top to get started'
    });
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
    return (
      <div>
        <div>
          <Menu displayName={this.state.username} logoutComplete={this.handleLogout.bind(this)} loginComplete={this.handleLogin.bind(this)}/>
        </div>
        <div className="story_manager">
          <span>{this.state.greeting}</span><button style={{'display': this.state.addStoryButtonDisplay}}>+</button>
        </div>
        <div>
          <ul className="stories">{this.state.stories}</ul>
        </div>
      </div>
    );
  }
}
