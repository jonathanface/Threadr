'use strict'

import React from 'react';
import ReactDOM from 'react-dom';
import Immutable from 'immutable';
import {EditorState, Editor, ContentState, SelectionState, Modifier, convertToRaw, convertFromRaw, RichUtils} from 'draft-js';
import FormatAlignLeftIcon from '@material-ui/icons/FormatAlignLeft';
import FormatAlignRightIcon from '@material-ui/icons/FormatAlignRight';
import FormatAlignCenterIcon from '@material-ui/icons/FormatAlignCenter';
import FormatAlignJustifyIcon from '@material-ui/icons/FormatAlignJustify';
import FormatBoldIcon from '@material-ui/icons/FormatBold';
import FormatItalicIcon from '@material-ui/icons/FormatItalic';
import FormatUnderlinedIcon from '@material-ui/icons/FormatUnderlined';

const styleMap = {
  'FONT_SIZE_6': {
    fontSize: '6px'
  },
  'FONT_SIZE_8': {
    fontSize: '8px'
  },
  'FONT_SIZE_10': {
    fontSize: '10px'
  },
  'FONT_SIZE_12': {
    fontSize: '12px'
  },
  'FONT_SIZE_14': {
    fontSize: '14px'
  },
  'FONT_SIZE_16': {
    fontSize: '16px'
  },
  'FONT_SIZE_18': {
    fontSize: '18px'
  },
  'FONT_SIZE_20': {
    fontSize: '20px'
  },
  'FONT_SIZE_22': {
    fontSize: '22px'
  },
  'FONT_SIZE_24': {
    fontSize: '24px'
  },
  'FONT_SIZE_28': {
    fontSize: '28px'
  },
  'FONT_SIZE_32': {
    fontSize: '32px'
  },
  'FONT_ARIAL': {
    fontFamily:'Arial,Helvetica Neue,Helvetica,sans-serif'
  },
  'FONT_VERDANA': {
    fontFamily:'Verdana,Geneva,sans-serif'
  },
  'FONT_COURIER': {
    fontFamily:'Courier New, Courier, serif mo=no'
  },
  'TEXT_ALIGN_LEFT': {
    textAlign:'left'
  },
  'TEXT_ALIGN_CENTER': {
    textAlign:'center'
  },
  'TEXT_ALIGN_RIGHT': {
    textAlign:'right'
  },
  'TEXT_ALIGN_JUSTIFY': {
    textAlign:'justify'
  },
  'LINE_HEIGHT_SINGLE': {
    lineHeight:'1rem'
  },
  'LINE_HEIGHT_1.5': {
    lineHeight:'1.5rem'
  },
  'LINE_HEIGHT_DOUBLE': {
    lineHeight:'2rem'
  }
};

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
      bottomMargin: 1 * dpi,
      fonts: ['Arial', 'Courier', 'Verdana'],
      fontSizes: [6,8,10,12,14,16,18,20,22,24,28,32],
      boldOn:false,
      italicOn:false,
      underlineOn:false,
      leftOn:true,
      centerOn:false,
      rightOn:false,
      justifyOn:false,
      currentFont:'ARIAL',
      currentFontSize:12
    }
    
    this.currentPage = 0;
    this.SERVICE_URL = '/api';
    this.SAVE_TIME_INTERVAL = 5000;
    this.hitDelete = false;
    this.socket = null;
    this.fetchWebsocketURL();
    this.novelID = 0;
    this.pendingEdits = new Map();
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
      this.pendingPageAdd = true;
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
      setTimeout(() => {
        this.checkPageHeightAndPushBlockToNextPage(pagesUpdate, index);
      }, 50);
      return pagesUpdate;
    }
    return pagesUpdate;
  }
  
  hasStyle = (editorState, style) => {
    const currentStyle = editorState.getCurrentInlineStyle();
    return currentStyle.has(style);
  }
  
  onChange = async(editorState, index, type) => {
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
          console.log('ed', editorState);
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
      
      if (cursorChange) {
        console.log('cursor change');
        let b=false, i=false, u=false;
        if (this.hasStyle(editorState, 'BOLD')) {
          b=true;
        }
        if (this.hasStyle(editorState, 'ITALIC')) {
          i = true;
        }
        if (this.hasStyle(editorState, 'UNDERLINE')) {
          u=true;
        }
        
        let selection = pagesUpdate[index].editorState.getSelection();
        let thisBlock = pagesUpdate[index].editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
        let data = thisBlock.getData();
        let alignment = data.getIn(['alignment']);
        let l=true, r=false, c=false, j = false;
        switch(alignment) {
          case 'CENTER':
            l = false;
            c = true;
            break;
          case 'RIGHT':
            l=false;
            r=true;
            break;
          case 'JUSTIFY':
            l = false;
            j = true;
            break;
        }
          
        this.setState({
          boldOn:b,
          italicOn:i,
          underlineOn:u,
          leftOn:l,
          rightOn:r,
          centerOn:c,
          justifyOn:j
        });
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
        if (deletedPage) {
          this.deletePage(index);
        } else {
          this.pendingEdits.set(this.currentPage, true);
        }
      }
    }
    
  }
  
  checkForPendingEdits() {
    if (this.pendingPageAdd) {
      this.pendingPageAdd = false;
      this.saveAllPages();
    }
    this.pendingEdits.forEach((value, key) => {
      if (value) {
        this.savePage(key);
        this.pendingEdits.set(key, false);
      }
    });
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
  
  formatText(style, e) {
    console.log('setting style', style);
    let pagesUpdate = this.state.pages;
    pagesUpdate[this.currentPage].editorState = RichUtils.toggleInlineStyle(pagesUpdate[this.currentPage].editorState, style);
    let b=false,i=false,u=false;
    switch(style) {
      case 'BOLD':
        b=true;
        break;
      case 'ITALIC':
        i=true;
        break;
      case 'UNDERLINE':
        u=true;
        break;
    }
    this.setState({
      pages:pagesUpdate,
      boldOn:b,
      italicOn:i,
      underlineOn:u
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }
  
  blockStyle(contentBlock) {
    const data = contentBlock.getData();
    let alignment = data.getIn(['alignment']);
    switch(alignment) {
      case 'LEFT':
        return 'textAlignLeft';
      case 'RIGHT':
        return 'textAlignRight';
      case 'CENTER':
        return 'textAlignCenter';
      case 'JUSTIFY':
        return 'textAlignJustify';
    }

  }
  
  updateTextAlignment(style, event) {
    event.preventDefault();
    let pagesUpdate = this.state.pages;
    let selection = pagesUpdate[this.currentPage].editorState.getSelection();
    console.log('sel', selection);
    const nextContentState = Modifier.setBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([['alignment', style]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    let l=false,c=false,r=false,j=false;
    switch(style) {
      case 'LEFT':
        l = true;
        break;
      case 'CENTER':
        c = true;
        break;
      case 'RIGHT':
        r = true;
        break;
      case 'JUSTIFY':
        j = true;
        break;
    }
      
    this.setState({
      pages:pagesUpdate,
      leftOn:l,
      centerOn:c,
      rightOn:r,
      justifyOn:j
    });
  }
  
  updateFont(event) {
    this.setState({
        currentFont:event.target.value
    }, () => {
      console.log('new font', this.state.currentFont);
      let pagesUpdate = this.state.pages;
      const selection = pagesUpdate[this.currentPage].editorState.getSelection();
      this.state.pages[this.currentPage].editorState = EditorState.forceSelection(this.state.pages[this.currentPage].editorState, selection);
      this.formatText('FONT_' + this.state.currentFont, event);
    });
  }
  
  updateFontSize(event) {
    event.preventDefault();
    let intVal = parseInt(event.target.value);
    if (!isNaN(intVal)) {
      this.setState({
        currentFontSize:intVal
      }, () => {
        console.log('new font size', this.state.currentFontSize);
        let pagesUpdate = this.state.pages;
        const selection = pagesUpdate[this.currentPage].editorState.getSelection();
        this.state.pages[this.currentPage].editorState = EditorState.forceSelection(this.state.pages[this.currentPage].editorState, selection);
        this.formatText('FONT_SIZE_' + this.state.currentFontSize, event);
      });
    }
  }
  
  setFocus(index) {
    this.refs[index].current.focus();
  }
  
  getFontList() {
    return (
      <React.Fragment>
        {this.state.fonts.map((font) => {
          if (font.toUpperCase() == this.currentFont) {
            return <option selected value={font.toUpperCase()} key={font}>{font}</option>
          }
          return <option value={font.toUpperCase()} key={font}>{font}</option>
        })}
      </React.Fragment>
    );
  }
  
  getFontSizeList() {
    return (
      <React.Fragment>
        {this.state.fontSizes.map((size) => {
          if (size == this.currentFontSize) {
            return <option selected value={size} key={size}>{size}</option>
          }
          return <option value={size} key={size}>{size}</option>
        })}
      </React.Fragment>
    );
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
                  blockStyleFn={this.blockStyle}
                  onChange={(editorState) => {
                    this.onChange(editorState, i);
                  }}
                  customStyleMap={styleMap}
                  ref={this.refs[i]}/>
        </section>
      );
    }
    
    return (
      <div className="editorRoot" style={{width:this.state.pageWidth}}>
        <nav >
          <div>
            <FormatAlignLeftIcon fontSize="inherit" className={this.state.leftOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('LEFT', e)}/>
            <FormatAlignCenterIcon fontSize="inherit"  className={this.state.centerOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('CENTER', e)}/>
            <FormatAlignRightIcon fontSize="inherit" className={this.state.rightOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('RIGHT', e)}/>
            <FormatAlignJustifyIcon fontSize="inherit" className={this.state.justifyOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('JUSTIFY', e)} />
          </div>
          <div>
            <FormatBoldIcon fontSize="inherit" className={this.state.boldOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('BOLD', e)} />
            <FormatItalicIcon className={this.state.italicOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('ITALIC', e)} />
            <FormatUnderlinedIcon className={this.state.underlineOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('UNDERLINE', e)} />
          </div>
          <div>
            <select onChange={(e) => this.updateFont(e)}>
              {this.getFontList()}
            </select>
            <select onChange={(e) => this.updateFontSize(e)}>
              {this.getFontSizeList()}
            </select>
          </div>
        </nav>
        <div onClick={this.focus} className="editorContainer" style={{maxHeight:this.state.pageHeight, height:this.state.pageHeight}}>
          {editors}
        </div>
      </div>
    );
  }
}