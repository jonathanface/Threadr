import React from 'react';
import {GoogleLogin} from 'react-google-login';
import {GoogleLogout} from 'react-google-login';
import PropTypes from 'prop-types';
import MenuIcon from '@material-ui/icons/Menu';

const lineSpacings = new Map();
lineSpacings.set('lineheight_single', 1);
lineSpacings.set('lineheight_medium', 1.5);
lineSpacings.set('lineheight_double', 2);

/**
 * Topmost menu for general user settings and doc editing
 */
export class CornerMenu extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.menuOpen = false;
    this.state = {
      displayName: props.displayName,
      loginButtonDisplayState: 'inline-block',
      logoutButtonDisplayState: 'none',
      dropdownDisplayState: 'none'
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
      loginFailed: PropTypes.func,
      nextProps: PropTypes.object
    };
  }

  /**
   * Callback for when Google oauth gets back to us
   *
   * @param {Object} response
   */
  responseGoogleSuccess(response) {
    let timing = (response.tokenObj.expires_in || 3600 - 5 * 60) * 1000;
    const refreshToken = async () => {
      const resp = await response.reloadAuthResponse();
      console.log('response', resp);
      timing = (resp.expires_in || 3600 - 5 * 60) * 1000;
      window.tokenID = resp.id_token;
      this.menuOpen = false;
      this.setState({
        loginButtonDisplayState: 'none',
        logoutButtonDisplayState: 'inline-block',
        dropdownDisplayState: 'none'
      });
      this.props.loginComplete();
      setTimeout(refreshToken, timing);
    };
    refreshToken();
  }

  /**
   * Callback for when Google oauth fails
   *
   * @param {Object} response
   */
  responseGoogleFailure(response) {
    console.error('failed login');
    this.props.loginFailed();
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

  /**
   * fired when clicked anywhere on document.body,
   * this is mostly to close the menu when clicking off italics
   *
   * @param {Event} event
   */
  clickedBody(event) {
    this.menuOpen = false;
    this.setState({
      dropdownDisplayState: 'none'
    });
  }

  /** componentdidmount **/
  componentDidMount() {
    document.body.addEventListener('click', this.clickedBody.bind(this));
  }

  /** componentwillunmount **/
  componentWillUnmount() {
    document.body.removeEventListener('click', this.clickedBody.bind(this));
  }

  /**
   * Callback for when Google oauth gets logged out
   */
  logout() {
    this.menuOpen = false;
    this.setState({
      loginButtonDisplayState: 'inline-block',
      logoutButtonDisplayState: 'none',
      dropdownDisplayState: 'none',
      displayName: ''
    });
    this.props.logoutComplete();
  }

  /**
   * show the dropdown menu when the menu
   * icon is clicked
   *
   * @param {Event} event
   */
  renderDropdownList(event) {
    event.stopPropagation();
    if (!this.menuOpen) {
      this.setState({
        dropdownDisplayState: 'inline-block'
      });
    } else {
      this.setState({
        dropdownDisplayState: 'none'
      });
    }
    this.menuOpen = !this.menuOpen;
  }

  /**
   * render
   * @return {element}
   */
  render() {
    return (
      <div className="main_menu">
        <span className="menu_left"></span>
        <span className="menu_right">
          <span className="display_name">{this.state.displayName}</span>
          <MenuIcon onClick={this.renderDropdownList.bind(this)}/>
          <ul style={{'display': this.state.dropdownDisplayState}}>
            <li style={{'display': this.state.loginButtonDisplayState}}>
              <GoogleLogin
                clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
                render={(renderProps) => (
                  <div onClick={renderProps.onClick} disabled={renderProps.disabled}>Login</div>
                )}
                onSuccess={this.responseGoogleSuccess.bind(this)}
                onFailure={this.responseGoogleFailure.bind(this)}
                isSignedIn={true}
                cookiePolicy={'single_host_origin'}
              />
            </li>
            <li style={{'display': this.state.logoutButtonDisplayState}}>
              <GoogleLogout
                clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
                render={(renderProps) => (
                  <div title="logout" onClick={renderProps.onClick} disabled={renderProps.disabled}>Logout</div>
                )}
                onLogoutSuccess={this.logout.bind(this)}
                onLogoutFailure={this.logout.bind(this)}
              />
            </li>
          </ul>
        </span>
      </div>
    );
  }
}
