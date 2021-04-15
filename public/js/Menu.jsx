import React from 'react';
import {Globals} from './Globals.jsx';
import {GoogleLogin} from 'react-google-login';
import {GoogleLogout} from 'react-google-login';
import PropTypes from 'prop-types';

/**
 * Topmost menu for general user settings and doc editing
 */
export class Menu extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.state = {
      displayName: props.displayName,
      loginButtonDisplayState: 'inline',
      logoutButtonDisplayState: 'none'
    };
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      displayName: PropTypes.string,
      loginComplete: PropTypes.func,
      logoutComplete: PropTypes.func,
      nextProps: PropTypes.object
    };
  }

  /**
   * Callback for when Google oauth gets back to us
   *
   * @param {Object} response
   */
  responseGoogle = (response) => {
    console.log(response);
    Globals.TOKEN_ID = response.tokenId;
    this.setState({
      loginButtonDisplayState: 'none',
      logoutButtonDisplayState: 'inline'
    });
    this.props.loginComplete();
  }

  /**
   * componentwillreceiveprops
   *
   * @param {Object} nextProps
   */
  UNSAFE_componentWillReceiveProps(nextProps) {
    this.setState({
      displayName: nextProps.displayName
    });
    console.log('Component received new props', nextProps);
  }

  /** componentdidmount **/
  componentDidMount() {
  }

  /**
   * Callback for when Google oauth gets logged out
   */
  logout = () => {
    this.setState({
      loginButtonDisplayState: 'inline',
      logoutButtonDisplayState: 'none',
      displayName: ''
    });
    this.props.logoutComplete();
  }

  /**
   * render
   * @return {element}
   */
  render() {
    return (
      <div className="main_menu">
        <span className="menu_right">
          <span className="display_name">{this.state.displayName}</span>
          <span style={{'display': this.state.loginButtonDisplayState}}>
            <GoogleLogin
              clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
              render={(renderProps) => (
                <button title="login with google" onClick={renderProps.onClick} disabled={renderProps.disabled}>
                  <img alt="login with google" src="img/google.svg"/>
                </button>
              )}
              onSuccess={this.responseGoogle.bind(this)}
              onFailure={this.responseGoogle.bind(this)}
              cookiePolicy={'single_host_origin'}
              isSignedIn={true}
            />
          </span>
          <span style={{'display': this.state.logoutButtonDisplayState}}>
            <GoogleLogout
              clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
              render={(renderProps) => (
                <button title="logout" onClick={renderProps.onClick} disabled={renderProps.disabled}>
                  <img alt="logout" src="img/google.svg"/>
                </button>
              )}
              onLogoutSuccess={this.logout.bind(this)}
              onLogoutFailure={this.logout.bind(this)}
            />
          </span>
        </span>
      </div>
    );
  }
}
