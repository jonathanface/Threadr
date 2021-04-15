import React from 'react';
import {Globals} from './Globals.jsx'
import {Document} from './Document.jsx';
import {Menu} from './Menu.jsx';


export class Landing extends React.Component {
  
  constructor() {
    super();
    
    this.state = {
      username:'',
      stories:[]
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
              receivedStories.push(<li key={story.id} data-id={story.id} data-last-accessed={t}>{story.title}</li>);
            }
            this.setState({
              stories:receivedStories
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
        <ul className="stories">{this.state.stories}</ul>
      </div>
    );
  }
  
}