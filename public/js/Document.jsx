import React from 'react';
import ReactDOM from 'react-dom';
import {EditorState, Editor, ContentState, SelectionState, convertToRaw, convertFromRaw} from 'draft-js';

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
              
              pages.push({'editor':editorState, pageNum:item.page});
              this.setState({
                pages:pages
              });
            });
          });
          break;
        case 404:
          console.log('wtf no pages');
          let blankpages = [];
          blankpages.push({'editor':EditorState.createEmpty(), 'pageNum':0});
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
    pages.push({'editor':EditorState.createEmpty(), 'pageNum':this.state.pages.length});
    this.setState ({
      pages:pages
    }, () => {
      this.refs[this.refs.length-1].current.focus();
      this.currentPage = this.refs.length-1;
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
      newpages.push({'editor':this.state.pages[i].editor, 'pageNum':i});
    }
    this.setState({
      pages:newpages
    });
  }
  
  onChange = (editorState, index) => {
    let cursorChange = false;
    if (this.state.pages[index].editor.getCurrentContent() === editorState.getCurrentContent() && !this.hitDelete) {
      cursorChange = true;
    }
    let addedPage = false;
    let deletedPage = false;
    let editor = this.refs[index].current;
    if (editor && !this.newPagePending && !this.hitDelete && !cursorChange && 
        editor.editorContainer.firstChild.firstChild.offsetHeight >=
        this.state.pageHeight - this.state.topMargin - this.state.bottomMargin) {
      console.log('new page requested');
      this.addNewPage(editorState);
      index++;
      let textStr = editorState.getCurrentContent().getPlainText();
      editorState = EditorState.moveFocusToEnd(EditorState.createWithContent(ContentState.createFromText(textStr[textStr.length-1])));
      addedPage = true;
      this.currentPage = index;
    }
    let pages = this.state.pages;
    pages[index] = {'editor':editorState, 'pageNum':index};
    this.setState({
      pages:pages
    }, () => {
      let blockDOM = this.getSelectedBlockElement();
      if (blockDOM) {
        let domY = blockDOM.getBoundingClientRect().top;
        if (Math.abs(domY - window.scrollY) > 400 || addedPage) {
          let scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
        }
      }
    });
    
    
    if (this.hitDelete) {
      this.hitDelete = false;
      console.log('has text??', this.state.pages[index].editor.getCurrentContent().hasText());
      if (!this.state.pages[index].editor.getCurrentContent().hasText() && this.state.pages.length > 1) {
        deletedPage = true;
        this.state.pages.splice(index, 1);
        this.recalcPagination();
        this.state.pages[index-1].editor = EditorState.moveFocusToEnd(this.state.pages[index-1].editor);
        this.setState({
          pages:this.state.pages
        }, () => {
          this.refs[index-1].current.focus();
          this.currentPage = index-1;
        });
      }
    }
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
      this.socket.send(JSON.stringify({command:'savePage', data: {page:index, novelID:this.novelID, body:convertToRaw(this.state.pages[index].editor.getCurrentContent())}}));
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
  
  render() {
    let editors = [];
    this.refs = [];
    console.log('rendering for ' + this.state.pages.length);
    for (let i=0; i < this.state.pages.length; i++) {
      this.refs.push(React.createRef());
      editors.push(
        <section key={i} className="margins" style={{paddingLeft:this.state.leftMargin, paddingRight:this.state.rightMargin, paddingTop:this.state.topMargin, paddingBottom:this.state.bottomMargin}}>
          <Editor 
                  handleKeyCommand={this.handleKeyCommand}
                  editorState={this.state.pages[i].editor}
                  placeholder="Write something..."
                  onChange={(editorState) => {
                    this.onChange(editorState, i);
                  }}
                  ref={this.refs[i]}/>
        </section>
      );
    }
    
    return (
      <div onClick={this.focus} className="editorContainer" style={{maxHeight:this.state.pageHeight, height:this.state.pageHeight, width:this.state.pageWidth}}>
        {editors}
      </div>
    );
  }
}