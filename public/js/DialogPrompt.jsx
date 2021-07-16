import React from 'react';
import PropTypes from 'prop-types';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';

/**
 * Custom alert/prompt dialog.
 */
export class DialogPrompt extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
  **/
  constructor(props) {
    super(props);
    this.isPrompt = props.isPrompt;
    this.isConfirm = props.isConfirm;
    this.okFunc = props.okFunc;
    this.cancelFunc = props.okFunc;

    this.state = {
      modalOpen: false,
      title: '',
      body: '',
      cancelButtonText: 'Nevermind',
      okButtonText: 'Do it',
      defaultFieldValue: props.defaultFieldValue,
      textFieldLabel: props.textFieldLabel
    };
  }

  /**
   * proptypes for lint
  **/
  static get propTypes() {
    return {
      isPrompt: PropTypes.bool,
      isConfirm: PropTypes.bool,
      title: PropTypes.string,
      defaultFieldValue: PropTypes.string,
      textFieldLabel: PropTypes.string,
      body: PropTypes.string,
      okFunc: PropTypes.func,
      cancelFunc: PropTypes.func,
      okButtonText: PropTypes.string,
      cancelButtonText: PropTypes.string
    };
  }

  /**
   * Props updated from parent
   *
   * @param {Object} props
  **/
  UNSAFE_componentWillReceiveProps(props) {
    this.isConfirm = props.isConfirm;
    this.isPrompt = props.isPrompt;
    this.okFunc = props.okFunc;
    this.cancelFunc = props.cancelFunc;
    this.setState({
      title: props.title,
      body: props.body,
      textFieldLabel: props.textFieldLabel,
      defaultFieldValue: props.defaultFieldValue
    });
    if (props.okButtonText) {
      this.setState({
        okButtonText: props.okButtonText
      });
    }
    if (props.cancelButtonText) {
      this.setState({
        cancelButtonText: props.cancelButtonText
      });
    }
  }

  /**
   * Toggle open the modal dialog
   *
   * @param {String} val
   */
  setModalOpen = (val) => {
    this.setState({
      modalOpen: val
    });
  };

  /**
   * Toggle closed the modal dialog
   */
  handleCloseModal = () => {
    this.setModalOpen(false);
  };

  /**
   * render
   * @return {element}
  **/
  render() {
    let dialogText = '';
    let width = 'sm';
    if (this.isPrompt) {
      width = 'md';
    }
    if (!this.cancelFunc) {
      this.cancelFunc = this.handleCloseModal.bind(this);
    }
    if (!this.okFunc) {
      this.okFunc = this.handleCloseModal.bind(this);
    }
    let buttonElements;
    if (this.isPrompt || this.isConfirm) {
      buttonElements = <span><Button onClick={this.cancelFunc} color="primary">{this.state.cancelButtonText}</Button><Button onClick={this.okFunc} color="primary" autoFocus>{this.state.okButtonText}</Button></span>;
    }
    if (this.isConfirm) {
      dialogText = <TextField
        autoFocus
        margin='dense'
        id='textValue'
        value={this.state.defaultFieldValue}
        label={this.state.textFieldLabel}
        type="text"
        fullWidth
      />;
    }
    if (!this.isPrompt && !this.isConfirm) {
      buttonElements = <Button onClick={this.okFunc} color="primary" autoFocus>{this.state.okButtonText}</Button>;
    }
    return (
      <Dialog
        fullWidth
        maxWidth={width}
        open={this.state.modalOpen}
        onClose={this.handleCloseModal.bind(this)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{this.state.title}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            {this.state.body}
          </DialogContentText>
          {dialogText}
        </DialogContent>
        <DialogActions>
          {buttonElements}
        </DialogActions>
      </Dialog>
    );
  }
}
