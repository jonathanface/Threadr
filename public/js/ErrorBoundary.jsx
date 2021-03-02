import React from 'react';
import PropTypes from 'prop-types';

/**
 * Catches and logs errors from child modules.
 * @constructor
 */
export class ErrorBoundary extends React.Component {
  /**
   * constructor
   *
   * @param {Object} props
   */
  constructor(props) {
    super(props);
    this.state = {hasError: false};
  }

  /**
   * Grab the state of the enclosed module from the thrown error.
   *
   * @param {error} error
   * @return {Object}
   */
  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return {hasError: true};
  }

  /**
   * componentDidCatch
   *
   * @param {error} error
   * @param {Object} errorInfo
   */
  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.log(error, errorInfo);
  }

  /**
   * render
   *
   * @return {element}
   */
  render() {
    console.log('child', this.props.children);
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.object
};

