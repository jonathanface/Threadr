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
import FormatLineSpacingIcon from '@material-ui/icons/FormatLineSpacing';

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
    fontFamily:'Arial,Helvetica Neue,Helvetica,sans-serif'
  },
  'fontFamily_Verdana': {
    fontFamily:'Verdana,Geneva,sans-serif'
  },
  'fontFamily_Courier': {
    fontFamily:'Courier New, Courier, serif-monospace'
  }
};

const fontNameMap = {
  styleMap.fontFamily_Arial.fontFamily: 'Arial',
  styleMap.fontFamily_Verdana.fontFamily : 'Verdana',
  styleMap.fontFamily_Courier.fontFamily:'Courier'
}

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
      fontSizes: ['6pt','8pt','10pt','12pt','14pt','16pt','18pt','20pt','22pt','24pt','28pt','32pt'],
      boldOn:false,
      italicOn:false,
      underlineOn:false,
      leftOn:true,
      centerOn:false,
      rightOn:false,
      justifyOn:false,
      currentFontSize:'12pt',
      currentFontFamily:'Arial',
      currentLineHeight:'single'
    }
    
    this.lineSpacings = new Map();
    this.lineSpacings.set('single', 1);
    this.lineSpacings.set('medium', 1.5);
    this.lineSpacings.set('double', 2);
    
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
    if (blockMap[blockKey]) {
      let newBlockMap = blockMap.remove(blockKey);
      console.log('post', newBlockMap);
      const newContentState = contentState.merge({
        blockMap: newBlockMap
      });
      return EditorState.push(editorState, newContentState, 'remove-range');
    }
    return null;
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
    
    let pagesUpdate = this.state.pages;
    const selection = editorState.getSelection();
    let blockTree = this.state.pages[index].editorState.getBlockTree(selection.getFocusKey());
    const thisBlock = editorState.getCurrentContent().getBlockForKey(selection.getFocusKey());
    if (!blockTree) {
      const prevSelection = editorState.getCurrentContent().getSelectionBefore();
      const lastBlock = editorState.getCurrentContent().getBlockForKey(prevSelection.getFocusKey());
      const data = lastBlock.getData();
      let alignment = data.getIn(['alignment']);
      let direction = 'LEFT';
      if (alignment) {
        direction = alignment;
      }
      const nextContentState = Modifier.setBlockData(editorState.getCurrentContent(), selection, Immutable.Map([['alignment', direction]]));
      editorState = EditorState.push(editorState, nextContentState, 'change-block-data');
    }
    
    let addedPage = false;
    let deletedPage = false;
    let editor = this.refs[index].current;
    
    if (editor) {
      if (this.hitDelete) {
        console.log('hit del');
        this.hitDelete = false;
        console.log('tried to delete', thisBlock.getText());
        if (!thisBlock.getText().length) {
          let newEditorState = this.removeBlockFromMap(editorState, thisBlock.getKey());
          if (newEditorState) {
            editorState = newEditorState;
          }
          if (editorState.getCurrentContent() && !editorState.getCurrentContent().hasText() && pagesUpdate.length > 1) {
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
        const currStyles = editorState.getCurrentInlineStyle();
        currStyles.forEach(v => {
          this.updateTextButtons(v);
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

  blockStyle(contentBlock) {
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
      classStr += 'height_' + lineHeight;
    }
    return classStr;
  }
  
  updateTextButtons(style) {
    let l=true,c=false,r=false,j=false;
    let b=false,i=false,u=false;
    switch(style) {
      case 'center':
        l = false;
        c = true;
        break;
      case 'right':
        l = false;
        r = true;
        break;
      case 'justify':
        l = false;
        j = true;
        break;
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
    let fontSize='12pt', fontFamily='Arial';
    if (styleMap.hasOwnProperty(style)) {
      if (style.indexOf('fontSize_') > -1) {
        fontSize = styleMap[style].fontSize;
      }
      if (style.indexOf('fontFamily_') > -1) {
        fontFamily = fontNameMap[styleMap[style].fontFamily];
      }
    }
    console.log('fam', fontFamily);
    console.log('sz', fontSize);

    this.setState({
      leftOn:l,
      centerOn:c,
      rightOn:r,
      justifyOn:j,
      boldOn:b,
      italicOn:i,
      underlineOn:u,
      currentFontSize:fontSize,
      currentFontFamily:fontFamily
    });
  }
  
  formatText(style, e) {
    console.log('setting style', style);
    let pagesUpdate = this.state.pages;
    this.updateTextButtons(style);
    pagesUpdate[this.currentPage].editorState = RichUtils.toggleInlineStyle(pagesUpdate[this.currentPage].editorState, style);
    this.setState({
      pages:pagesUpdate,
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }
  
  updateTextAlignment(style, event) {
    event.preventDefault();
    let pagesUpdate = this.state.pages;
    let selection = pagesUpdate[this.currentPage].editorState.getSelection();
    const nextContentState = Modifier.setBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([['alignment', style]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    this.updateTextButtons(style);
    this.setState({
      pages:pagesUpdate
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }
  
  updateLineHeight(event) {
    event.preventDefault();
    let clicked = event.target.dataset.height;
    let displayValue = 1, nextSpacing = 'single';
    let prevMatch = false;
    for (let [key, value] of this.lineSpacings) {
      if (key == clicked) {
        prevMatch = true;
        continue;
      }
      if (prevMatch) {
        nextSpacing = key;
        displayValue = this.lineSpacings.get(key);
        break;
      }
    }
    let pagesUpdate = this.state.pages;
    const selection = pagesUpdate[this.currentPage].editorState.getSelection();
    pagesUpdate[this.currentPage].editorState = EditorState.forceSelection(this.state.pages[this.currentPage].editorState, selection);
    const nextContentState = Modifier.setBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([['lineHeight', nextSpacing]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    this.setState({
      pages:pagesUpdate,
      currentLineHeight: nextSpacing,
      currentLineHeightDisplay:displayValue
    }, () => {
      this.pendingEdits.set(this.currentPage, true);
    });
  }
  
  updateFontDetails(event, type) {
    event.preventDefault();
    let value = event.target.value;
    let pagesUpdate = this.state.pages;
    const selection = pagesUpdate[this.currentPage].editorState.getSelection();
    pagesUpdate[this.currentPage].editorState = EditorState.forceSelection(this.state.pages[this.currentPage].editorState, selection);
    const nextContentState = Modifier.setBlockData(pagesUpdate[this.currentPage].editorState.getCurrentContent(), selection, Immutable.Map([[type, value]]));
    pagesUpdate[this.currentPage].editorState = EditorState.push(pagesUpdate[this.currentPage].editorState, nextContentState, 'change-block-data');
    let formatParam, field;
    switch(type) {
      case 'family':
        formatParam = 'fontFamily_' + value;
        field = 'currentFontFamily';
        break;
      case 'size':
        formatParam = 'fontSize_' + value;
        field = 'currentFontSize';
        break;
    }
    this.setState({
      pages:pagesUpdate,
      [field]:value
    }, () => {
      this.formatText(formatParam, event);
    });
  }

  setFocus(index) {
    this.refs[index].current.focus();
  }
  
  getFormatOptions(type) {
    var array;
    switch(type) {
      case 'fonts':
        array = this.state.fonts;
        break;
      case 'fontSizes':
        array = this.state.fontSizes;
        break;
    }
    return (
      <React.Fragment>
        {array.map((item) => {
          return <option value={item} key={item}>{item}</option>
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
                  blockStyleFn={this.blockStyle.bind(this)}
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
            <FormatAlignLeftIcon fontSize="inherit" className={this.state.leftOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('left', e)}/>
            <FormatAlignCenterIcon fontSize="inherit"  className={this.state.centerOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('center', e)}/>
            <FormatAlignRightIcon fontSize="inherit" className={this.state.rightOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('right', e)}/>
            <FormatAlignJustifyIcon fontSize="inherit" className={this.state.justifyOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateTextAlignment('justify', e)} />
            <span>
              <FormatLineSpacingIcon data-height={this.state.currentLineHeight} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.updateLineHeight(e)}/>
              <span>{this.lineSpacings.get(this.state.currentLineHeight)}</span>
            </span>
          </div>
          <div>
            <FormatBoldIcon fontSize="inherit" className={this.state.boldOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('BOLD', e)} />
            <FormatItalicIcon className={this.state.italicOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('ITALIC', e)} />
            <FormatUnderlinedIcon className={this.state.underlineOn ? 'on' : ''} fontSize="inherit" onMouseDown={(e) => e.preventDefault()} onClick={(e) => this.formatText('UNDERLINE', e)} />
          </div>
          <div>
            <select value={this.state.currentFontFamily} onChange={(e) => this.updateFontDetails(e, 'family')}>
              {this.getFormatOptions('fonts')}
            </select>
            <select value={this.state.currentFontSize} onChange={(e) => this.updateFontDetails(e, 'size')}>
              {this.getFormatOptions('fontSizes')}
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