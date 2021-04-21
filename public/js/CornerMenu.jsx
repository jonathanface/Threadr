import React from 'react';
import {Globals} from './Globals.jsx';
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
  responseGoogleSuccess = (response) => {
    console.log(response);
    Globals.TOKEN_ID = response.tokenId;
    this.menuOpen = false;
    this.setState({
      loginButtonDisplayState: 'none',
      logoutButtonDisplayState: 'inline-block',
      dropdownDisplayState: 'none'
    });
    this.props.loginComplete();
  }

  /**
   * Callback for when Google oauth fails
   *
   * @param {Object} response
   */
  responseGoogleFailure = (response) => {
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
  
  clickedBody = (event) => {
    this.menuOpen = false;
    this.setState({
      dropdownDisplayState:'none'
    });
  }

  /** componentdidmount **/
  componentDidMount() {
    document.body.addEventListener('click', this.clickedBody);
  }
  
  componentWillUnmount() {
    document.body.removeEventListener('click', this.clickedBody);
  }

  /**
   * Callback for when Google oauth gets logged out
   */
  logout = () => {
    this.menuOpen = false;
    this.setState({
      loginButtonDisplayState: 'inline-block',
      logoutButtonDisplayState: 'none',
      dropdownDisplayState: 'none',
      displayName: ''
    });
    this.props.logoutComplete();
  }

  renderDropdownList = (event) => {
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
          <MenuIcon onClick={this.renderDropdownList}/>
          <ul style={{'display': this.state.dropdownDisplayState}}>
            <li style={{'display': this.state.loginButtonDisplayState}}>
              <GoogleLogin
                clientId="878388830212-tq6uhegouorlrn7srsn3getqkn4er3fg.apps.googleusercontent.com"
                render={(renderProps) => (
                  <div onClick={renderProps.onClick} disabled={renderProps.disabled}>Login</div>
                )}
                onSuccess={this.responseGoogleSuccess.bind(this)}
                onFailure={this.responseGoogleFailure.bind(this)}
                cookiePolicy={'single_host_origin'}
                isSignedIn={true}
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
