import React from 'react';
import {Globals} from './Globals.jsx'
import {Document} from './Document.jsx';
import { GoogleLogin } from 'react-google-login';
import { GoogleLogout } from 'react-google-login';


export class Landing extends React.Component {
  
  constructor() {
    super();
    
    this.state = {
      loginButtonDisplayState:'inline',
      logoutButtonDisplayState:'none'
    }
  }
  
  responseGoogle = (response) => {
    console.log(response);
    Globals.TOKEN_ID = response.tokenId;
    this.setState({
      loginButtonDisplayState:'none',
      logoutButtonDisplayState:'inline'
    });
    this.fetchDocuments();
  }
  
  componentDidMount() {
    
  }
  
  logout = () => {
    this.setState({
      loginButtonDisplayState:'inline',
      logoutButtonDisplayState:'none'
    });
  }
  
  fetchDocuments() {
    return fetch(Globals.SERVICE_URL + '/stories', {
      method:'GET',
      headers:Globals.getHeaders()
    }).then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
          });
          break;
      }
    });   
  }
  
  render() {
    return(
      <div>
        <span style={{'display':this.state.loginButtonDisplayState}}>
          <GoogleLogin
            clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
            buttonText="Login"
            onSuccess={this.responseGoogle}
            onFailure={this.responseGoogle}
            cookiePolicy={'single_host_origin'}
            isSignedIn={true}
          />
        </span>
        <span style={{'display':this.state.logoutButtonDisplayState}}>
          <GoogleLogout
            clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
            buttonText="Logout"
            onLogoutSuccess={this.logout}
            onLogoutFailure={this.logout}
          />
        </span>
      </div>
    );
  }
  
}