import React from 'react';
import ReactDOM from 'react-dom';
import {EditorState, Editor, ContentState, SelectionState, Modifier, convertToRaw, convertFromRaw} from 'draft-js';
import FormatAlignLeftIcon from '@material-ui/icons/FormatAlignLeft';
import FormatAlignRightIcon from '@material-ui/icons/FormatAlignRight';
import FormatAlignCenterIcon from '@material-ui/icons/FormatAlignCenter';
import FormatAlignJustifyIcon from '@material-ui/icons/FormatAlignJustify';
import FormatBoldIcon from '@material-ui/icons/FormatBold';
import FormatItalicIcon from '@material-ui/icons/FormatItalic';
import FormatUnderlinedIcon from '@material-ui/icons/FormatUnderlined';

export class Document extends React.Component {
  
  constructor() {
    super();
    
    let dpi = this.getDPI();
    
    /*
    let decorator = new CompositeDecorator([
      {
        strategy: this.renderPage(),
        component: PageBackground
      }
    ]);*/
    this.refs = [];
    this.newPagePending = false;
    this.state = {
      pages:[],
      pageWidth: 8.25 * dpi,
      pageHeight: 11.75 * dpi,
      topMargin: 1 * dpi,
      leftMargin: 1 * dpi,
      rightMargin: 1 * dpi,
      bottomMargin: 1 * dpi
    }
    
    this.currentPage = 0;
    this.SERVICE_URL = '/api';
    this.SAVE_TIME_INTERVAL = 5000;
    this.hitDelete = false;
    this.socket = null;
    this.fetchWebsocketURL();
    this.novelID = 0;
    this.pendingEdits = [];
    this.pendingPageAdd = false;
    this.pendingPageDeletions = [];
    this.fetchDocumentPages()
    this.checkSaveInterval = setInterval(() => this.checkForPendingEdits(), this.SAVE_TIME_INTERVAL);
  }
  
  fetchDocumentPages() {
    fetch(this.SERVICE_URL + '/story/' + this.novelID + '/pages').then(response => {
      switch (response.status) {
        case 200:
          response.json().then(data => {
            let pages = [];
            data.forEach(item => {
              console.log(item.body);
              let contentState = convertFromRaw(item.body);
              console.log(contentState);
              let editorState = EditorState.createWithContent(contentState);
              
              pages.push({'editorState':editorState, pageNum:item.page});
              this.setState({
                pages:pages
              });
            });
          });
          break;
        case 404:
          console.log('wtf no pages');
          let blankpages = [];
          blankpages.push({'editorState':EditorState.createEmpty(), 'pageNum':0});
          this.setState({
            pages:blankpages
          });
          break;
      }      
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  }
  
  setupWebsocket(url) {
    this.socket = new WebSocket(url);
    this.socket.isOpen = false;
    // Connection opened
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
  
  fetchWebsocketURL() {
    fetch('./wsinit').then(response => response.json()).then(data => {
      console.log('Success:', data);
      this.setupWebsocket(data.url);
    })
    .catch((error) => {
      console.error('Error:', error);
    });
  }
  
  addNewPage(editorState) {
    this.newPagePending = true;
    let pages = this.state.pages;
    pages.push({'editorState':EditorState.createEmpty(), 'pageNum':this.state.pages.length});
    this.setState ({
      pages:pages
    }, () => {
      //this.setFocus(this.refs.length-1);
      //this.currentPage = this.refs.length-1;
      this.newPagePending = false;
    });
    
  }
  
  getSelectedBlockElement() {
    var selection = window.getSelection()
    if (selection.rangeCount == 0) return null
    var node = selection.getRangeAt(0).startContainer
    do {
      if (node.getAttribute && node.getAttribute('data-block') == 'true')
        return node
      node = node.parentNode
    } while (node != null)
    return null
  }
  
  recalcPagination() {
    let newpages = [];
    for (let i=0; i < this.state.pages.length; i++) {
      newpages.push({'editorState':this.state.pages[i].editorState, 'pageNum':i});
    }
    this.setState({
      pages:newpages
    });
  }
  
  removeBlockFromMap(editorState, blockKey) {
    let contentState = editorState.getCurrentContent();
    console.log(editorState.getCurrentContent().getPlainText());
    let blockMap = contentState.getBlockMap();
    console.log('pre', blockMap);
    let newBlockMap = blockMap.remove(blockKey);
    console.log('post', newBlockMap);
    const newContentState = contentState.merge({
      blockMap: newBlockMap
    });
    return EditorState.push(editorState, newContentState, 'remove-range');
  }
  
  async checkPageHeightAndPushBlockToNextPage(pagesUpdate, index) {
    const editor = this.refs[index].current;
    let maxHeight = this.state.pageHeight - this.state.topMargin - this.state.bottomMargin;
    console.log(editor.editorContainer.firstChild.firstChild.offsetHeight, " vs ", maxHeight);
    if (editor.editorContainer.firstChild.firstChild.offsetHeight >= maxHeight && !this.newPagePending) {
      if (!pagesUpdate[index+1]) {
        this.addNewPage();
        return this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, index);
      }
      const removeBlock = pagesUpdate[index].editorState.getCurrentContent().getLastBlock();
      var currentSelectedKey = pagesUpdate[index].editorState.getSelection().focusKey;
      let blockArray = [];
      blockArray.push(removeBlock);
      blockArray = blockArray.concat(pagesUpdate[index+1].editorState.getCurrentContent().getBlockMap().toArray());
      const combinedContentState = ContentState.createFromBlockArray(blockArray);
      pagesUpdate[index+1].editorState = EditorState.push(pagesUpdate[index+1].editorState, combinedContentState);
      pagesUpdate[index].editorState = this.removeBlockFromMap(pagesUpdate[index].editorState, removeBlock.getKey());
      this.setState({
        pages:pagesUpdate
      }, () => {
        this.currentPage = this.refs.length-1;
        if (currentSelectedKey == removeBlock.getKey()) {
          this.setFocus(index+1);
          const selection = pagesUpdate[index].editorState.getSelection();
          pagesUpdate[index+1].editorState = EditorState.forceSelection(pagesUpdate[index+1].editorState, selection);
          this.setState({
            pages:pagesUpdate
          });
        }
        return this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, index);
      });
    } else if (this.newPagePending) {
      return this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, index);
    }
    return pagesUpdate;
  }
  
  onChange = async(editorState, index) => {
    let cursorChange = false;
    if (this.state.pages[index].editorState.getCurrentContent() === editorState.getCurrentContent() && !this.hitDelete) {
      cursorChange = true;
    }
    let addedPage = false;
    let deletedPage = false;
    let editor = this.refs[index].current;
    let pagesUpdate = this.state.pages;
    console.log('change to page', index);
    if (editor) {
      if (this.hitDelete) {
        console.log('hit del');
        this.hitDelete = false;
        const selection = pagesUpdate[index].editorState.getSelection();
        let thisBlock = pagesUpdate[index].editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
        console.log('tried to delete', thisBlock.getText());
        if (!thisBlock.getText().length) {
          editorState = this.removeBlockFromMap(editorState, thisBlock.getKey());
          if (!editorState.getCurrentContent().hasText() && pagesUpdate.length > 1) {
            deletedPage = true;
            pagesUpdate.splice(index, 1);
            this.recalcPagination();
            pagesUpdate[index-1].editorState = EditorState.moveFocusToEnd(pagesUpdate[index-1].editorState);
          }
        }
      }
      if (!deletedPage) {
        pagesUpdate[index].editorState = editorState;
        pagesUpdate = await this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, index);
      }
      this.setState({
        pages:pagesUpdate
      }, () => {
        if (deletedPage) {
          this.setFocus(index-1);
          this.currentPage = index-1;
        }
        let blockDOM = this.getSelectedBlockElement();
        if (blockDOM) {
          let domY = blockDOM.getBoundingClientRect().top;
          if (Math.abs(domY - window.scrollY) > 400 || addedPage) {
            let scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
          }
        }
      });
      
      if (!cursorChange) {
        if (addedPage) {
          this.pendingPageAdd = true;
        } else if (deletedPage) {
          this.deletePage(index);
        } else {
          this.pendingEdits.push(this.currentPage);
        }
      }
    }
    
  }
  
  checkForPendingEdits() {
    if (this.pendingPageAdd) {
      this.pendingPageAdd = false;
      this.saveAllPages();
    }
    for (let i=0; i < this.pendingEdits.length; i++) {
      this.savePage(this.pendingEdits[i]);
    }
    this.pendingEdits = [];
  }
  
  savePage(index) {
    console.log('saving page ' + index);
    if (this.socket.isOpen) {
      this.socket.send(JSON.stringify({command:'savePage', data: {page:index, novelID:this.novelID, body:convertToRaw(this.state.pages[index].editorState.getCurrentContent())}}));
    }
  }
  
  saveAllPages() {
    for (let i=0; i < this.state.pages.length; i++) {
      this.savePage(i);
    }
  }
  
  deletePage(index) {
    console.log('deleting page', index);
    if (this.socket.isOpen) {
      this.socket.send(JSON.stringify({command:'deletePage', data: {page:index, novelID:this.novelID}}));
    }
  }
  
  getDPI() {
    for (var i = 56; i < 2000; i++) {
      if (matchMedia("(max-resolution: " + i + "dpi)").matches === true) {
        return i;
      }
    }
    return i;
  }
  
  handleKeyCommand = (command) => {
    console.log('cmd', command);
    switch(command.toLowerCase()) {
      case 'delete':
      case 'backspace':
        this.hitDelete = true;
        break;
    }
  }
  
  formatText(type, e) {
    console.log(type, e);
    let editorState = this.state.pages[this.currentPage].editorState;
    let selection = editorState.getSelection();
    if (selection.size) {
      const contentState = Modifier.applyInlineStyle(editorState.getCurrentContent(), selection, "font-weight:bold;");
      EditorState.push(editorState, contentState, "change-inline-style");
      
    }
  }
  
  updateSettings() {
    
  }
  
  setFocus(index) {
    this.refs[index].current.focus();
  }
  
  render() {
    let editors = [];
    this.refs = [];
    console.log('rendering for ' + this.state.pages.length);
    for (let i=0; i < this.state.pages.length; i++) {
      this.refs.push(React.createRef());
      editors.push(
        <section key={i} onClick={() => {this.setFocus(i);}} className="margins" style={{paddingLeft:this.state.leftMargin, paddingRight:this.state.rightMargin, paddingTop:this.state.topMargin, paddingBottom:this.state.bottomMargin}}>
          <Editor 
                  handleKeyCommand={this.handleKeyCommand}
                  editorState={this.state.pages[i].editorState}
                  placeholder="Write something..."
                  onChange={(editorState) => {
                    this.onChange(editorState, i);
                  }}
                  ref={this.refs[i]}/>
        </section>
      );
    }
    
    return (
      <div className="editorRoot" style={{width:this.state.pageWidth}}>
        <nav >
          <div>
            <FormatAlignLeftIcon fontSize="inherit"/>
            <FormatAlignCenterIcon fontSize="inherit"/>
            <FormatAlignRightIcon fontSize="inherit"/>
            <FormatAlignJustifyIcon fontSize="inherit"/>
          </div>
          <div>
            <FormatBoldIcon fontSize="inherit" onClick={(e) => this.formatText('b', e)} />
            <FormatItalicIcon fontSize="inherit"/>
            <FormatUnderlinedIcon fontSize="inherit"/>
          </div>
          <div>
            <select>
              <option>Arial</option>
              <option>Courier New</option>
              <option>Verdana</option>
            </select>
            <input className="selectable" list="fontSize" value="12" onChange={this.updateSettings} />
            <datalist id="fontSize">
              <option value="8"/>
              <option value="10"/>
              <option value="12" defaultValue/>
              <option value="16"/>
              <option value="20"/>
              <option value="24"/>
            </datalist>
          </div>
        </nav>
        <div onClick={this.focus} className="editorContainer" style={{maxHeight:this.state.pageHeight, height:this.state.pageHeight}}>
          {editors}
        </div>
      </div>
    );
  }
}