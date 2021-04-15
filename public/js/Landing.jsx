import React from 'react';
import {Globals} from './Globals.jsx'
import {Document} from './Document.jsx';
import {Menu} from './Menu.jsx';


export class Landing extends React.Component {
  
  constructor() {
    super();
    
    this.state = {
      username:'',
      stories:[],
      greeting:'You haven\'t begun any stories yet...'
    }
  }
  
  componentDidMount() {
    
  }
  
  fetchDocuments() {
    return fetch(Globals.SERVICE_URL + '/stories', {
      method:'GET',
      headers:Globals.getHeaders()
    });  
  }

  fetchUserDetails() {
    return fetch(Globals.SERVICE_URL + '/user/name', {
      method:'GET',
      headers:Globals.getHeaders()
    });
  }
  
  handleLogin() {
    this.fetchUserDetails().then((response) => {
      console.log('resp', response);
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            console.log('user data', data);
            this.setState({
              username:data.given_name
            });
          });
          break;
      }
    });
    this.fetchDocuments().then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            console.log('documents', data);
            let receivedStories = [];
            for (let story of data) {
              let t = Date.parse(story.lastAccessed)/1000;
              console.log(t)
              receivedStories.push(<li contenteditable="true" key={story.id} data-id={story.id} data-last-accessed={t}>{story.title}</li>);
            }
            let newGreeting = this.state.greeting;
            if (receivedStories.length) {
              newGreeting=''
            }
            this.setState({
              stories:receivedStories,
              greeting:newGreeting
            });
          });
          break;
      }
    }); 
  }
  
  render() {
    return(
      <div>
        <div>
          <Menu displayName={this.state.username} loginComplete={this.handleLogin.bind(this)}/>
        </div>
        <div className="story_manager">
          <span>{this.state.greeting}</span><button>+</button>
        </div>
        <div>
          <ul className="stories">{this.state.stories}</ul>
        </div>
      </div>
    );
  }
  
}