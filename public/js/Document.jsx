import React from 'react';
import ReactDOM from 'react-dom';
import {EditorState, Editor, ContentState, SelectionState} from 'draft-js';

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
    this.state.pages.push(EditorState.createEmpty());
    this.currentPage = 0;
    this.hitDelete = false;
  }
  
  addNewPage(editorState) {
    this.newPagePending = true;
    let pages = this.state.pages;
    pages.push(EditorState.createEmpty());
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
  
  onChange = (editorState, index) => {
    if (this.state.pages[index].getCurrentContent() === editorState.getCurrentContent()) {
      return;
    }
    let addingPage = false;
    let editor = this.refs[index].current;
    if (!this.newPagePending && !this.hitDelete &&
        editor.editorContainer.firstChild.firstChild.offsetHeight >=
        this.state.pageHeight - this.state.topMargin - this.state.bottomMargin) {
      console.log('new page requested');
      this.addNewPage(editorState);
      index++;
      let textStr = editorState.getCurrentContent().getPlainText();
      editorState = EditorState.moveFocusToEnd(EditorState.createWithContent(ContentState.createFromText(textStr[textStr.length-1])));
      addingPage = true;
    }
    let pages = this.state.pages;
    pages[index] = editorState;
    this.setState({
      pages:pages
    }, () => {
      let blockDOM = this.getSelectedBlockElement();
      let domY = blockDOM.getBoundingClientRect().top;
      console.log(blockDOM.getBoundingClientRect().top, window.scrollY);
      if (Math.abs(domY - window.scrollY) > 400 || addingPage) {
        console.log('scroll now');
        let scrollToY = blockDOM.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({top: scrollToY-100, behavior: 'smooth'});
      }
    });
    
    
    if (this.hitDelete) {
      this.hitDelete = false;
      if (!this.state.pages[index].getCurrentContent().hasText() && this.state.pages.length > 1) {
        this.state.pages.splice(index, 1);
        this.state.pages[index-1] = EditorState.moveFocusToEnd(this.state.pages[index-1]);
        this.setState({
          pages:this.state.pages
        }, () => {
          this.refs[index-1].current.focus();
          this.currentPage = index-1;
        });
      }
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
                  editorState={this.state.pages[i]}
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
/*
class PageBackground extends React.Component {
  
  constructor() {
    super();
  }
  
  render {
    
  }
  
}*/