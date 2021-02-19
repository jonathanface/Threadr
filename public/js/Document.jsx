import React from 'react';
import Immutable from 'immutable';
import {EditorState, Editor, ContentState, SelectionState, Modifier, convertToRaw, convertFromRaw, RichUtils, getDefaultKeyBinding, KeyBindingUtil} from 'draft-js';
import {DocSelector} from './Utilities.jsx';

/**
 * Represents a document containing a work of fiction.
 * @constructor
 */
export class Document extends React.Component {
  /** constructor **/
  constructor() {
    super();

    const dpi = this.getDPI();

   
    this.refHandles = [];

    this.state = {
      pages: [],
      pageWidth: 8.25 * dpi,
      pageHeight: 11.75 * dpi,
      topMargin: 1 * dpi,
      leftMargin: 1 * dpi,
      rightMargin: 1 * dpi,
      bottomMargin: 1 * dpi
    };
    this.maxWidth = this.state.pageWidth - (this.state.leftMargin + this.state.rightMargin);
    this.currentPage = 0;
    this.SERVICE_URL = '/api';
    this.SAVE_TIME_INTERVAL = 5000;
    this.socket = null;
    this.fetchWebsocketURL();
    this.novelID = 0;
    this.deletePressed = false;
    this.pendingEdits = new Map();
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
      this.pendingEdits[pages.length] = true;
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
   * @param {number} pageNumber
   * @param {boolean} renderedNewPage
   */
  async checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber, renderedNewPage) {
    const pages = this.state.pages;
    if (!pages[pageNumber] || !this.refHandles[pageNumber]) {
      return;
    }
    const editor = this.refHandles[pageNumber].current;
    const maxHeight = this.state.pageHeight - this.state.topMargin - this.state.bottomMargin;
    const selection = pages[pageNumber].editorState.getSelection();
    if (editor.editorContainer.firstChild.firstChild.offsetHeight > maxHeight) {
      if (!pages[pageNumber+1]) {
        await this.addNewPage();
        return this.checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber, true);
      }
      const removeBlock = pages[pageNumber].editorState.getCurrentContent().getLastBlock();
      
      let blockArray = [];
      blockArray.push(removeBlock);
      if (!renderedNewPage) {
        blockArray = blockArray.concat(pages[pageNumber+1].editorState.getCurrentContent().getBlockMap().toArray());
      }
      const combinedContentState = ContentState.createFromBlockArray(blockArray);
      const slicedEditorState = this.removeBlockFromMap(pages[pageNumber].editorState, removeBlock.getKey());
      if (!slicedEditorState) {
        console.log('unable to slice off last block');
        return;
      }
      pages[pageNumber+1].editorState = EditorState.push(pages[pageNumber+1].editorState, combinedContentState);
      pages[pageNumber].editorState = slicedEditorState;
      this.setState({
        pages: pages
      }, () => {
        this.currentPage = this.refHandles.length-1;
        const currentSelectedKey = selection.focusKey;
        if (currentSelectedKey == removeBlock.getKey()) {
          this.setFocus(pageNumber+1);
          const selection = pages[pageNumber].editorState.getSelection();
          pages[pageNumber+1].editorState = EditorState.forceSelection(pages[pageNumber+1].editorState, selection);
          this.setState({
            pages: pages
          });
        }
        return this.checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber);
      });
    }
  }
  
  this.shiftUpPages(pageNumber) {
    const pagesUpdate = this.state.pages;
    for (let i=pageNumber+1; i < pagesUpdate.length; i++) {
      const nextPageFirstBlock = pagesUpdate[i].editorState.getCurrentContent().getFirstBlock();
      pagesUpdate[i].editorState = this.removeBlockFromMap(pagesUpdate[i].editorState, nextPageFirstBlock.getKey());
      const thisPageSelection = new SelectionState({
        anchorKey: prevPageLastBlock.getKey(), // key of block
        anchorOffset: prevPageLastBlock.getText().length,
        focusKey: prevPageLastBlock.getKey(),
        focusOffset: prevPageLastBlock.getText().length, // key of block
        hasFocus: true
      });
            
            console.log('prev', prevPageLastBlock.getText());
            console.log('sel', prevSelection);
            //
            const ncs = Modifier.insertText(pagesUpdate[pageNumber-1].editorState.getCurrentContent(), prevSelection, block.getText());
            pagesUpdate[pageNumber-1].editorState = EditorState.push(pagesUpdate[pageNumber-1].editorState, ncs, 'insert-fragment');
            
            pagesUpdate[pageNumber-1].editorState = EditorState.forceSelection(pagesUpdate[pageNumber-1].editorState, prevSelection);
    }
  }

  /**
   * Fires on every DraftJS keystroke or cursor change
   *
   * @param {EditorState} editorState
   * @param {number} pageNumber
   */
  onChange(editorState, pageNumber) {
    console.log('change', pageNumber);
    const pagesUpdate = this.state.pages;
    // Cursor has moved but no text changes detected.
    if (this.state.pages[pageNumber].editorState.getCurrentContent() === editorState.getCurrentContent() && !this.deletePressed) {
      console.log('no change');
      return;
    }
    
    const hadTextPrevious = pagesUpdate[pageNumber].editorState.getCurrentContent().hasText();
    pagesUpdate[pageNumber].editorState = editorState;

    this.setState({
      pages: pagesUpdate
    }, async () => {
      if (this.deletePressed) {
        console.log('delpressed');
        const selection = editorState.getSelection();
        const blockKey =  selection.getFocusKey();
        const block = editorState.getCurrentContent().getBlockForKey(blockKey);
        const firstKey = editorState.getCurrentContent().getFirstBlock().getKey();
        if (blockKey == firstKey && pageNumber > 0) {
          //we are on the first line of the page
          if (!selection.getFocusOffset()) {
            // cursor is at the start of the line
            console.log(block.getCharacterList());
            const prevPageLastBlock = pagesUpdate[pageNumber-1].editorState.getCurrentContent().getLastBlock();
            const prevSelection = new SelectionState({
              anchorKey: prevPageLastBlock.getKey(), // key of block
              anchorOffset: prevPageLastBlock.getText().length,
              focusKey: prevPageLastBlock.getKey(),
              focusOffset: prevPageLastBlock.getText().length, // key of block
              hasFocus: true
            });
            
            console.log('prev', prevPageLastBlock.getText());
            console.log('sel', prevSelection);
            //
            const ncs = Modifier.insertText(pagesUpdate[pageNumber-1].editorState.getCurrentContent(), prevSelection, block.getText());
            pagesUpdate[pageNumber-1].editorState = EditorState.push(pagesUpdate[pageNumber-1].editorState, ncs, 'insert-fragment');
            pagesUpdate[pageNumber].editorState = this.removeBlockFromMap(editorState, blockKey);
            pagesUpdate[pageNumber-1].editorState = EditorState.forceSelection(pagesUpdate[pageNumber-1].editorState, prevSelection);
            

            this.currentPage--;
            this.setState({pages:pagesUpdate});
            this.shiftUpPages(pageNumber);
          }
        } 
        /**
        else if (!block.getText().length){
          pagesUpdate[pageNumber].editorState = this.removeBlockFromMap(editorState, blockKey);
        }
        
        console.log('content', editorState.getCurrentContent().hasText(), hadTextPrevious);
        if (!editorState.getCurrentContent().hasText() && !hadTextPrevious && pagesUpdate.length > 1) {
          this.setFocus(pageNumber-1);
          pagesUpdate.splice(pageNumber, 1);
          this.refHandles.splice(pageNumber, 1);
          this.recalcPagination();
          this.deletePage(pageNumber);
          this.currentPage--;
          pagesUpdate[pageNumber-1].editorState = EditorState.moveFocusToEnd(pagesUpdate[pageNumber-1].editorState);
          this.setState({
            pages: pagesUpdate
          }, () => {
            this.scrollToBlock();
          });
        }*/
        this.deletePressed = false;
        return;
      }
      await this.checkPageHeightAndAdvanceToNextPageIfNeeded(pageNumber);
      this.pendingEdits.set(pageNumber, true);
    });
    
  }
  
  scrollToBlock() {
    const blockDOM = this.getSelectedBlockElement();
    if (blockDOM) {
      const domY = blockDOM.getBoundingClientRect().top;
      if (Math.abs(domY - window.scrollY) > 400) {
        const scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
      }
    }
  }

  /**
   * Check stored action arrays for upcoming writes
   */
  checkForPendingEdits() {
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

  keyBindings(e) {
    //console.log('code', e.keyCode);
    if (e.ctrlKey) {
      if (e.keyCode == 83) {
        return 'ctrl_s';
      }
      if (e.keyCode == 190) {
        return 'ctrl_>';
      }
      if (e.keyCode == 188) {
        return 'ctrl_<';
      }
    }
    return getDefaultKeyBinding(e);
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
        console.log('hit delete');
        this.deletePressed = true;
        this.onChange(this.state.pages[pageNumber].editorState, pageNumber);
        break;
      }
      case 'bold':
      case 'italic':
      case 'underline':{
        const pagesUpdate = this.state.pages;
        pagesUpdate[this.currentPage].editorState = RichUtils.toggleInlineStyle(pagesUpdate[this.currentPage].editorState, command.toUpperCase());
        this.setState({
          pages: pagesUpdate,
        });
        break;
      }
    }
  }
  
  /**
   * Set focus to passed Draft element
   * @param {number} index
   */
  setFocus(index) {
    //console.log('focus on', index);
    this.currentPage = index;
    this.refHandles[index].current.focus();
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
          <section key={i} onClick={() => {this.setFocus(i);}} className="margins" style={{maxHeight: this.state.pageHeight, height: this.state.pageHeight, paddingLeft: this.state.leftMargin, paddingRight: this.state.rightMargin, paddingTop: this.state.topMargin, paddingBottom: this.state.bottomMargin}}>
            <Editor
              editorState={this.state.pages[i].editorState}
              handleKeyCommand={(command) => {
                this.handleKeyCommand(command, i);
              }}
              keyBindingFn={this.keyBindings}
              placeholder="Write something..."
              onChange={(editorState) => {
                this.onChange(editorState, i);
              }}
              ref={this.refHandles[i]}/>
          </section>
      );
    }
    return (
      <div>
        <nav className="docControls">
          <ul style={{width:this.state.pageWidth}}>
            <li>hello</li>
          </ul>
        </nav>
        <div className="editorRoot" style={{width: this.state.pageWidth}}>
          <div onClick={this.focus} className="editorContainer">
            {editors}
          </div>
        </div>
      </div>
    );
  }
}
