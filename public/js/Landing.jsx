import React from 'react';
import {Globals} from './Globals.jsx'
import {Document} from './Document.jsx';
import {Menu} from './Menu.jsx';


export class Landing extends React.Component {
  
  constructor() {
    super();
    
    this.state = {
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
          });
          break;
      }
    });
    this.fetchDocuments().then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            console.log('documents', data);
          });
          break;
      }
    }); 
  }
  
  render() {
    return(
      <div>
        <Menu loginComplete={this.handleLogin.bind(this)}/>
      </div>
    );
  }
  
}