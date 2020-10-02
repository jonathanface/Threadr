import React from 'react';
import Immutable from 'immutable';
import {EditorState, Editor, ContentState, Modifier, convertToRaw, convertFromRaw, RichUtils} from 'draft-js';
import FormatAlignLeftIcon from '@material-ui/icons/FormatAlignLeft';
import FormatAlignRightIcon from '@material-ui/icons/FormatAlignRight';
import FormatAlignCenterIcon from '@material-ui/icons/FormatAlignCenter';
import FormatAlignJustifyIcon from '@material-ui/icons/FormatAlignJustify';
import FormatBoldIcon from '@material-ui/icons/FormatBold';
import FormatItalicIcon from '@material-ui/icons/FormatItalic';
import FormatUnderlinedIcon from '@material-ui/icons/FormatUnderlined';
import FormatLineSpacingIcon from '@material-ui/icons/FormatLineSpacing';

import {DocSelector} from './Utilities.jsx';

const styleMap = {
  'fontSize_6pt': {
    fontSize: '6pt'
  },
  'fontSize_8pt': {
    fontSize: '8pt'
  },
  'fontSize_10pt': {
    fontSize: '10pt'
  },
  'fontSize_12pt': {
    fontSize: '12pt'
  },
  'fontSize_14pt': {
    fontSize: '14pt'
  },
  'fontSize_16pt': {
    fontSize: '16pt'
  },
  'fontSize_18pt': {
    fontSize: '18pt'
  },
  'fontSize_20pt': {
    fontSize: '20pt'
  },
  'fontSize_22pt': {
    fontSize: '22pt'
  },
  'fontSize_24pt': {
    fontSize: '24pt'
  },
  'fontSize_28pt': {
    fontSize: '28pt'
  },
  'fontSize_32pt': {
    fontSize: '32pt'
  },
  'fontFamily_Arial': {
    fontFamily: 'Arial,Helvetica Neue,Helvetica,sans-serif'
  },
  'fontFamily_Verdana': {
    fontFamily: 'Verdana,Geneva,sans-serif'
  },
  'fontFamily_Courier': {
    fontFamily: 'Courier New, Courier, serif-monospace'
  }
};

const fontNameMap = {
  'Arial,Helvetica Neue,Helvetica,sans-serif': 'Arial',
  'Verdana,Geneva,sans-serif': 'Verdana',
  'Courier New, Courier, serif-monospace': 'Courier'
};

const lineSpacings = new Map();
lineSpacings.set('lineheight_single', 1);
lineSpacings.set('lineheight_medium', 1.5);
lineSpacings.set('lineheight_double', 2);

/**
 * Represents a document containing a work of fiction.
 * @constructor
 */
export class Document extends React.Component {
  /** constructor **/
  constructor() {
    super();

    const dpi = this.getDPI();

    /*
    let decorator = new CompositeDecorator([
      {
        strategy: this.renderPage(),
        component: PageBackground
      }
    ]);*/
    this.refHandles = [];
    const fontFamilyLabels = ['Arial', 'Courier', 'Verdana'];
    const fontSizeLabels = ['6pt', '8pt', '10pt', '12pt', '14pt',
      '16pt', '18pt', '20pt', '22pt', '24pt', '28pt', '32pt'];
    const fontFamilies = new Map();
    const fontSizes = new Map();
    fontFamilyLabels.forEach((family) => {
      fontFamilies.set('fontFamily_' + family, family);
    });
    fontSizeLabels.forEach((size) => {
      fontSizes.set('fontSize_' + size, size);
    });

    this.state = {
      pages: [],
      pageWidth: 8.25 * dpi,
      pageHeight: 11.75 * dpi,
      topMargin: 1 * dpi,
      leftMargin: 1 * dpi,
      rightMargin: 1 * dpi,
      bottomMargin: 1 * dpi,
      fontFamilies: fontFamilies,
      fontSizes: fontSizes,
      boldOn: false,
      italicOn: false,
      underlineOn: false,
      leftOn: true,
      centerOn: false,
      rightOn: false,
      justifyOn: false,
      currentFontSize: '12pt',
      currentFontFamily: 'Arial',
      currentLineHeight: 'lineheight_single'
    };

    this.fontFamilySelector;
    this.fontSizeSelector;
    this.currentPage = 0;
    this.SERVICE_URL = '/api';
    this.SAVE_TIME_INTERVAL = 5000;
    this.deletedPage = false;
    this.socket = null;
    this.fetchWebsocketURL();
    this.novelID = 0;
    this.pendingEdits = new Map();
    this.newPageSaveRequired = false;
    this.pendingPageDeletions = [];
    this.fetchDocumentPages();
    this.checkSaveInterval = setInterval(() => this.checkForPendingEdits(), this.SAVE_TIME_INTERVAL);
  }
  /** componentDidMount **/
  componentDidMount() {
    window.addEventListener('beforeunload', this.beforeunload.bind(this));
  }

  /** beforeunload **/
  beforeunload() {
    if (this.socket.isOpen) {
      this.socket.close();
    }
  }

  /**
   * gets all pages for a given document
   */
  fetchDocumentPages() {
    fetch(this.SERVICE_URL + '/story/' + this.novelID + '/pages').then((response) => {
      switch (response.status) {
        case 200:
          response.json().then((data) => {
            const pages = [];
            data.forEach((item) => {
              const contentState = convertFromRaw(item.body);
              const editorState = EditorState.createWithContent(contentState);
              pages.push({'editorState': editorState, 'pageNum': item.page});
              this.setState({
                pages: pages
              });
            });
          });
          break;
        case 404: {
          const blankpages = [];
          blankpages.push({'editorState': EditorState.createEmpty(), 'pageNum': 0});
          this.setState({
            pages: blankpages
          });
          break;
        }
      }
    }).catch((error) => {
      console.error('Error:', error);
    });
  }

  /**
   * Init websocket and assign handlers
   *
   * @param {string} url
   */
  setupWebsocket(url) {
    this.socket = new WebSocket(url);
    this.socket.isOpen = false;

    this.socket.onopen = (event) => {
      this.socket.isOpen = true;
    };
    this.socket.onclose = (event) => {
      console.log('socket closed', event);
      this.socket.isOpen = false;
      setTimeout(this.setupWebsocket, 500, url);
    };
    this.socket.onerror = (event) => {
      this.socket.isOpen = false;
      setTimeout(this.setupWebsocket, 5000, url);
    };
    this.socket.onmessage = (event) => {
      console.log('Message from server', event.data);
    };
  }

  /**
   * Get the full URL of the websocket from the API
   */
  fetchWebsocketURL() {
    fetch('./wsinit').then((response) => response.json()).then((data) => {
      this.setupWebsocket(data.url);
    }).catch((error) => {
      console.error('Error:', error);
    });
  }

  /**
   * Add a new page to the bottom of the document.
   */
  async addNewPage() {
    const pages = this.state.pages;
    const editorState = EditorState.createEmpty();
    pages.push({'editorState': editorState, 'pageNum': pages.length});
    const removeBlock = pages[pages.length-1].editorState.getCurrentContent();
    console.log('new page', removeBlock.getBlockMap());
    //
    await this.setState({
      pages: pages
    }, async () => {
      this.newPageSaveRequired = true;
      return;
    });
  }

  /**
   * Get the current block element being selected
   *
   * @return {Node}
   */
  getSelectedBlockElement() {
    const selection = window.getSelection();
    if (selection.rangeCount == 0) {
      return null;
    }
    let node = selection.getRangeAt(0).startContainer;
    do {
      if (node.getAttribute && node.getAttribute('data-block') == 'true') {
        return node;
      }
      node = node.parentNode;
    } while (node !== null);
    return null;
  }

  /**
   * Recount pages and update page numbers
   * This is mostly to occur after page add or delete
   */
  recalcPagination() {
    const newpages = [];
    for (let i=0; i < this.state.pages.length; i++) {
      newpages.push({'editorState': this.state.pages[i].editorState, 'pageNum': i});
    }
    this.setState({
      pages: newpages
    });
  }

  /**
   * Remove a block element from the map, which will
   * remove it from the dom as well.
   *
   * @param {EditorState} editorState
   * @param {string} blockKey
   * @return {EditorState}
   */
  removeBlockFromMap(editorState, blockKey) {
    const contentState = editorState.getCurrentContent();
    const blockMap = contentState.getBlockMap();
    if (blockMap.has(blockKey)) {
      const newBlockMap = blockMap.remove(blockKey);
      const newContentState = contentState.merge({
        blockMap: newBlockMap
      });
      return EditorState.push(editorState, newContentState, 'remove-range');
    }
    return null;
  }

  /**
   * Check if page's contents exceed maximum height and push it to the subsequent page,
   * creating one if necessary.
   *
   * @param {array} pageObjectsToUpdate
   * @param {number} pageNumber
   * @param {boolean} renderedNewPage
   */
  async checkPageHeightAndPushBlockToNextPage(pageObjectsToUpdate, pageNumber, renderedNewPage) {
    const editor = this.refHandles[pageNumber].current;
    const maxHeight = this.state.pageHeight - this.state.topMargin - this.state.bottomMargin;
    // console.log(editor.editorContainer.firstChild.firstChild.offsetHeight, " vs ", maxHeight);
    if (editor.editorContainer.firstChild.firstChild.offsetHeight >= maxHeight ) {
      if (!pageObjectsToUpdate[pageNumber+1]) {
        await this.addNewPage();
        return this.checkPageHeightAndPushBlockToNextPage(this.state.pages, pageNumber, true);
      }
      const removeBlock = pageObjectsToUpdate[pageNumber].editorState.getCurrentContent().getLastBlock();
      const currentSelectedKey = pageObjectsToUpdate[pageNumber].editorState.getSelection().focusKey;
      let blockArray = [];
      blockArray.push(removeBlock);
      if (!renderedNewPage) {
        blockArray = blockArray.concat(pageObjectsToUpdate[pageNumber+1].editorState.getCurrentContent().getBlockMap().toArray());
      }
      const combinedContentState = ContentState.createFromBlockArray(blockArray);

      const slicedEditorState = this.removeBlockFromMap(pageObjectsToUpdate[pageNumber].editorState, removeBlock.getKey());
      if (!slicedEditorState) {
        console.log('unable to slice off last block');
        return pageObjectsToUpdate;
      }
      pageObjectsToUpdate[pageNumber+1].editorState = EditorState.push(pageObjectsToUpdate[pageNumber+1].editorState, combinedContentState);
      pageObjectsToUpdate[pageNumber].editorState = slicedEditorState;
      this.setState({
        pages: pageObjectsToUpdate
      }, () => {
        this.currentPage = this.refHandles.length-1;
        if (currentSelectedKey == removeBlock.getKey()) {
          this.setFocus(pageNumber+1);
          const selection = pageObjectsToUpdate[pageNumber].editorState.getSelection();
          pageObjectsToUpdate[pageNumber+1].editorState = EditorState.forceSelection(pageObjectsToUpdate[pageNumber+1].editorState, selection);
          this.setState({
            pages: pageObjectsToUpdate
          });
        }
        return this.checkPageHeightAndPushBlockToNextPage(pageObjectsToUpdate, pageNumber);
      });
    }
    return pageObjectsToUpdate;
  }

  /**
   * Check if the current selection has a given inline style
   *
   * @param {EditorState} editorState
   * @param {string} style
   * @return {boolean}
   */
  hasStyle(editorState, style) {
    const currentStyle = editorState.getCurrentInlineStyle();
    return currentStyle.has(style);
  }

  /**
   * Get styles of the preceding block
   *
   * @param {EditorState} editorState
   * @return {boolean}
   */
  getPreviousBlockStyles(editorState) {
    const prevSelection = editorState.getCurrentContent().getSelectionBefore();
    const lastBlock = editorState.getCurrentContent().getBlockForKey(prevSelection.getFocusKey());
    const data = lastBlock.getData();
    const styles = {};
    const alignment = data.getIn(['alignment']);
    styles.direction = alignment;
    const lineHeight = data.getIn(['lineHeight']);
    let height = 'lineheight_single';
    if (lineHeight) {
      height = lineHeight;
    }
    styles.lineHeight = height;
    return styles;
  }

  /**
   * Fires on every DraftJS keystroke or cursor change
   *
   * @param {EditorState} editorState
   * @param {number} pageNumber
   */
  onChange(editorState, pageNumber) {
    console.log('ONCHANGE~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');

    const pagesUpdate = this.state.pages;
    const selection = editorState.getSelection();
    // only for cursor moves without text change

    if (this.deletedPage) {
      pagesUpdate[pageNumber-1].editorState = EditorState.moveFocusToEnd(pagesUpdate[pageNumber-1].editorState);
      this.deletedPage = false;
    }

    if (this.state.pages[pageNumber].editorState.getCurrentContent() === editorState.getCurrentContent()) {
      try {
        console.log('cursor change');
        this.setState({
          boldOn: false,
          italicOn: false,
          underlineOn: false
        });
        const currStyles = editorState.getCurrentInlineStyle();
        let foundFontFamily = false;
        let foundFontSize = false;
        currStyles.forEach((v) => {
          if (v.indexOf('fontSize_') > -1) {
            foundFontSize = v;
          }
          if (v.indexOf('fontFamily_') > -1) {
            foundFontFamily = v;
          }
          this.updateTextButtons(v);
        });

        const lastBlock = editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
        const data = lastBlock.getData();
        const alignment = data.getIn(['alignment']);
        if (alignment) {
          this.updateTextButtons(alignment);
        }
        const lineHeight = data.getIn(['lineHeight']);
        if (lineHeight) {
          this.updateTextButtons(lineHeight);
        }
        // No inline styles, so toggle controls UI to defaults.
        if (!foundFontSize) {
          foundFontSize = 'fontSize_12pt';
        }
        if (!foundFontFamily) {
          foundFontFamily = 'fontFamily_Arial';
        }
        this.setState({
          currentFontFamily: foundFontFamily,
          currentFontSize: foundFontSize
        });
        this.fontFamilySelector.current.update(foundFontFamily);
        this.fontSizeSelector.current.update(foundFontSize);
        pagesUpdate[pageNumber].editorState = editorState;
        this.setState({
          pages: pagesUpdate
        });
        return;
      } catch (e) {
        console.error(e);
        return;
      }
    }

    const dataMap = [];
    const blockTree = this.state.pages[pageNumber].editorState.getBlockTree(selection.getFocusKey());
    if (!blockTree) {
      // a new block has been added, copy styles from previous block
      const styles = this.getPreviousBlockStyles(editorState);
      dataMap.push(['alignment', styles.direction]);
      dataMap.push(['lineHeight', styles.lineHeight]);
      const iMap = Immutable.Map(dataMap);
      const nextContentState = Modifier.mergeBlockData(editorState.getCurrentContent(), selection, iMap);
      editorState = EditorState.push(editorState, nextContentState, 'change-block-data');
    }
    pagesUpdate[pageNumber].editorState = editorState;

    this.setState({
      pages: pagesUpdate
    }, async () => {
      const adjustedPages = await this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, pageNumber);
      this.setState({
        pages: adjustedPages
      }, () => {
        const blockDOM = this.getSelectedBlockElement();
        if (blockDOM) {
          const domY = blockDOM.getBoundingClientRect().top;
          if (Math.abs(domY - window.scrollY) > 400) {
            const scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
          }
        }
        this.pendingEdits.set(pageNumber, true);
      });
    });
  }

  /**
   * Check stored action arrays for upcoming writes
   */
  checkForPendingEdits() {
    if (this.newPageSaveRequired) {
      this.newPageSaveRequired = false;
      this.saveAllPages();
    }
    this.pendingEdits.forEach((value, key) => {
      if (value) {
        this.savePage(key);
        this.pendingEdits.set(key, false);
      }
    });
  }

  /**
   * Send command via websocket save specific page
   *
   * @param {number} pageNumber
   */
  savePage(pageNumber) {
    console.log('saving page ' + pageNumber);
    // Send the encoded page if the socket is open and it hasn't been subsequently deleted
    if (this.socket.isOpen && this.state.pages[pageNumber]) {
      this.socket.send(JSON.stringify({command: 'savePage', data: {page: pageNumber, novelID: this.novelID, body: convertToRaw(this.state.pages[pageNumber].editorState.getCurrentContent())}}));
    }
  }

  /**
   * Send command via websocket to save all pages
   */
  saveAllPages() {
    for (let i=0; i < this.state.pages.length; i++) {
      this.savePage(i);
    }
  }

  /**
   * Send command via websocket to delete given page
   *
   * @param {number} pageNumber
   */
  deletePage(pageNumber) {
    console.log('deleting page', pageNumber);
    if (this.socket.isOpen) {
      this.socket.send(JSON.stringify({command: 'deletePage', data: {page: pageNumber, novelID: this.novelID}}));
    }
  }

  /**
   * Get user's resolution based on device DPI
   *
   * @return {number} resolution
   */
  getDPI() {
    let i=56;
    for (i = 56; i < 2000; i++) {
      if (matchMedia('(max-resolution: ' + i + 'dpi)').matches === true) {
        return i;
      }
    }
    return i;
  }


  /**
   * Calls for specific keypresses
   *
   * @param {string} command
   * @param {number} pageNumber
   */
  handleKeyCommand(command, pageNumber) {
    console.log('cmd', command, 'page', pageNumber);
    switch (command.toLowerCase()) {
      case 'delete':
      case 'backspace': {
        const pagesUpdate = this.state.pages;
        const editorState = pagesUpdate[pageNumber].editorState;
        const content = editorState.getCurrentContent();
        const selection = editorState.getSelection();
        const block = editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
        if (!content.hasText() && pagesUpdate.length > 1) {
          this.deletedPage = true;
          this.setFocus(pageNumber-1);
          pagesUpdate.splice(pageNumber, 1);
          this.refHandles.splice(pageNumber, 1);
          this.recalcPagination();
          this.deletePage(pageNumber);
          this.currentPage--;
        } else if (!block.getText().length) {
          pagesUpdate[pageNumber].editorState = this.removeBlockFromMap(editorState, selection.getFocusKey());
        }
        this.setState({
          pages: pagesUpdate
        });
        break;
      }
    }
  }

  /**
   * get block css styles from block metadata
   *
   * @param {Block} contentBlock
   * @return {string} classStr
   */
  generateBlockStyle(contentBlock) {
    let classStr = '';
    const data = contentBlock.getData();
    const alignment = data.getIn(['alignment']);
    if (alignment) {
      classStr += 'align_' + data.getIn(['alignment']);
    }
    const lineHeight = data.getIn(['lineHeight']);
    if (lineHeight) {
      if (classStr.length) {
        classStr += ' ';
      }
      classStr += lineHeight;
    }
    return classStr;
  }

  /**
   * Update text-level UI controls to reflect current selection's formatting
   *
   * @param {string} style
   */
  updateTextButtons(style) {
    if (lineSpacings.has(style)) {
      this.setState({
        currentLineHeight: style
      });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(styleMap, style)) {
      if (style.indexOf('fontSize_') > -1) {
        this.setState({
          currentFontSize: styleMap[style].fontSize
        });
        return;
      }
      if (style.indexOf('fontFamily_') > -1) {
        this.setState({
          currentFontFamily: fontNameMap[styleMap[style].fontFamily]
        });
        return;
      }
    }
    let l=true;
    let c=false;
    let r=false;
    let j=false;
    let changeAlignment=false;
    switch (style) {
      case 'center':
        l = false;
        c = true;
        changeAlignment = true;
        break;
      case 'right':
        l = false;
        r = true;
        changeAlignment = true;
        break;
      case 'justify':
        l = false;
        j = true;
        changeAlignment = true;
        break;
    }
    if (changeAlignment) {
      this.setState({
        leftOn: l,
        centerOn: c,
        rightOn: r,
        justifyOn: j
      });
      return;
    }

    switch (style) {
      case 'BOLD':
        this.setState({
          boldOn: true
        });
        break;
      case 'ITALIC':
        this.setState({
          italicOn: true
        });
        break;
      case 'UNDERLINE':
        this.setState({
          underlineOn: true
        });
        break;
    }
  }

  /**
   * Apply bold, italic, or underline CSS to selected text
   *
   * @param {string} style
   * @param {event} event
   * @param {boolean} skipSave
   */
  formatText(style, event, skipSave) {
    console.log('setting style', style, ' on page ', this.currentPage);
    const pagesUpdate = this.state.pages;
    this.updateTextButtons(style, pagesUpdate[this.currentPage].editorState);
    pagesUpdate[this.currentPage].editorState = RichUtils.toggleInlineStyle(pagesUpdate[this.currentPage].editorState, style);
    this.setState({
      pages: pagesUpdate,
    }, () => {
      if (!skipSave) {
        this.pendingEdits.set(this.currentPage, true);
      }
    });
  }

  /**
   * Update the current block's alignment based on button click
   *
   * @param {string} style
   * @param {event} event
   */
  updateTextAlignment(style, event) {
    event.preventDefault();
    const pagesUpdate = this.state.pages;
    const selection = pagesUpdate[this.currentPage].editorState.getSelection();
    const nextContentState = Modifier.mergeBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([['alignment', style]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    this.updateTextButtons(style, pagesUpdate[this.currentPage].editorState);
    this.setState({
      pages: pagesUpdate
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }

  /**
   * Update the current block's line-height based on button click
   *
   * @param {event} event
   */
  updateLineHeight(event) {
    event.preventDefault();
    const clicked = event.target.dataset.height;
    let nextSpacing = 'lineheight_single';
    let prevMatch = false;
    let key;
    for ([key] of lineSpacings) {
      if (key == clicked) {
        prevMatch = true;
        continue;
      }
      if (prevMatch) {
        nextSpacing = key;
        break;
      }
    }
    const pagesUpdate = this.state.pages;
    const selection = pagesUpdate[this.currentPage].editorState.getSelection();
    pagesUpdate[this.currentPage].editorState = EditorState.forceSelection(this.state.pages[this.currentPage].editorState, selection);
    const nextContentState = Modifier.mergeBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([['lineHeight', nextSpacing]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    this.setState({
      pages: pagesUpdate,
      currentLineHeight: nextSpacing
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }

  /**
   * Change text font family and/or size when combobox changes
   *
   * @param {string} type
   * @param {string} value
   */
  updateFontDetails(type, value) {
    const pagesUpdate = this.state.pages;
    const selection = pagesUpdate[this.currentPage].editorState.getSelection();
    const nextContentState = Modifier.mergeBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([[type, value]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    let field;
    switch (type) {
      case 'fontFamily':
        field = 'currentFontFamily';
        break;
      case 'fontSize':
        field = 'currentFontSize';
        break;
    }
    this.setState({
      pages: pagesUpdate,
      [field]: value
    }, () => {
      this.formatText(value, event);
    });
  }

  /**
   * Set focus to passed Draft element
   * @param {number} index
   */
  setFocus(index) {
    console.log('focus on', index);
    this.currentPage = index;
    this.refHandles[index].current.focus();
  }

  /**
   * get font and fontSize available options for render
   * @param {string} type
   * @return {map}
   */
  getFormatOptions(type) {
    let map;
    switch (type) {
      case 'fontFamilies':
        map = this.state.fontFamilies;
        break;
      case 'fontSizes':
        map = this.state.fontSizes;
        break;
    }
    return map;
  }

  /**
   * render
   * @return {element}
  **/
  render() {
    const editors = [];
    console.log('rendering for ' + this.state.pages.length);
    for (let i=0; i < this.state.pages.length; i++) {
      this.refHandles.push(React.createRef());
      editors.push(
          <section key={i} onClick={() => {this.setFocus(i);}} className="margins" style={{paddingLeft: this.state.leftMargin, paddingRight: this.state.rightMargin, paddingTop: this.state.topMargin, paddingBottom: this.state.bottomMargin}}>
            <Editor
              editorState={this.state.pages[i].editorState}
              handleKeyCommand={(command) => {
                this.handleKeyCommand(command, i);
              }}
              placeholder="Write something..."
              blockStyleFn={this.generateBlockStyle.bind(this)}
              onChange={(editorState) => {
                this.onChange(editorState, i);
              }}
              customStyleMap={styleMap}
              ref={this.refHandles[i]}/>
          </section>
      );
    }
    this.fontFamilySelector = React.createRef();
    this.fontSizeSelector = React.createRef();
    return (
      <div className="editorRoot" style={{width: this.state.pageWidth}}>
        <nav >
          <div>
            <FormatAlignLeftIcon fontSize="inherit" className={this.state.leftOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('left', e)}/>
            <FormatAlignCenterIcon fontSize="inherit" className={this.state.centerOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('center', e)}/>
            <FormatAlignRightIcon fontSize="inherit" className={this.state.rightOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('right', e)}/>
            <FormatAlignJustifyIcon fontSize="inherit" className={this.state.justifyOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('justify', e)} />
            <span>
              <FormatLineSpacingIcon data-height={this.state.currentLineHeight} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateLineHeight(e)}/>
              <span>{lineSpacings.get(this.state.currentLineHeight)}</span>
            </span>
          </div>
          <div>
            <FormatBoldIcon fontSize="inherit" className={this.state.boldOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('BOLD', e)} />
            <FormatItalicIcon className={this.state.italicOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('ITALIC', e)} />
            <FormatUnderlinedIcon className={this.state.underlineOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('UNDERLINE', e)} />
          </div>
          <div>
            <DocSelector ref={this.fontFamilySelector} type="fontFamily" action={this.updateFontDetails.bind(this)} value={this.state.currentFontFamily} options={this.getFormatOptions('fontFamilies')}/>
            <DocSelector ref={this.fontSizeSelector} type="fontSize" action={this.updateFontDetails.bind(this)} value={this.state.currentFontSize} options={this.getFormatOptions('fontSizes')}/>
          </div>
        </nav>
        <div onClick={this.focus} className="editorContainer" style={{maxHeight: this.state.pageHeight, height: this.state.pageHeight}}>
          {editors}
        </div>
      </div>
    );
  }
}
