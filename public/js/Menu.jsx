import React from 'react';
import {Globals} from './Globals.jsx'
import { GoogleLogin } from 'react-google-login';
import { GoogleLogout } from 'react-google-login';

export class Menu extends React.Component {
  
  constructor(props) {
    super(props);
    
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
    this.props.loginComplete();
  }
  
  componentDidMount() {
    
  }
  
  logout = () => {
    this.setState({
      loginButtonDisplayState:'inline',
      logoutButtonDisplayState:'none'
    });
  }
  
  render() {
    return(
      <div className="main_menu">
        <span className="menu_right">
          <span style={{'display':this.state.loginButtonDisplayState}}>
            <GoogleLogin
              clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
              render={renderProps => (
                <button title="login with google" onClick={renderProps.onClick} disabled={renderProps.disabled}>
                  <img alt="login with google" src="img/google.svg"/>
                </button>
              )}
              onSuccess={this.responseGoogle}
              onFailure={this.responseGoogle}
              cookiePolicy={'single_host_origin'}
              isSignedIn={true}
            />
          </span>
          <span style={{'display':this.state.logoutButtonDisplayState}}>
            <GoogleLogout
              clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
              render={renderProps => (
                <button title="logout" onClick={renderProps.onClick} disabled={renderProps.disabled}>
                  <img alt="logout" src="img/google.svg"/>
                </button>
              )}
              onLogoutSuccess={this.logout}
              onLogoutFailure={this.logout}
            />
          </span>
        </span>
      </div>
    );
  }
  
}