var self;

class Drafty {
  
  constructor() {
    self = this;
    this.launchWriter();
    this.socketURL;
    this.ws_open = false;
    this.socket;
    this.pingInterval;
    this.PING_INTERVAL_TIME = 3000;
    this.pages = [];
    this.currentPage = 0;
  }
  
  removeEmptyElements(page) {
    var ps = page.childNodes;
    for (var p = 0; p < ps.length; p++) {
      var text = ps[p].innerText || ps[p].textContent;
      if (text.length <= 0) {
        try {
          page.removeChild(ps[p].parentNode);
        } catch(e) {
          console.log(e);
        }
      }
    }
  }
  
  async launchWriter() {
    try {
      let html = await getHTML('draft.html');
      document.querySelector('#content').innerHTML = html;
      var tools = document.querySelectorAll('menuitem');
      for (var i=0; i < tools.length; i++) {
        this.addMenuMouseEvents(tools[i]);
      }

      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
          let websocket_data = JSON.parse(this.responseText);
          self.connect_to_socket(websocket_data.url);
        }
      };
      xhttp.open("GET", '/wsinit', true);
      xhttp.send();
    
    } catch(error) {
      console.log(error);
    }
  }
  
  checkOverflow(page) {
    let computedStyle = getComputedStyle(page);
    let elementHeight = page.clientHeight;  // height with padding
    elementHeight -= parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);
    return elementHeight <= page.querySelector('.heightMeasure').clientHeight;
  }
  
  addPageEvents(page) {
    page.onkeydown = function(event) {
      if (event.keyCode == 9) {
        event.preventDefault();
      }
      if (event.keyCode != 8 && self.checkOverflow(page)) {
        self.newPage();
      }
      
    };
    page.onkeyup = page.onpaste = function(event) {
      self.removeEmptyElements(page);
      if (event.keyCode == 9 || event.keyCode == 13) {
        document.execCommand('insertHTML', false, '&#009');
      }
      var text = self.getLastPage().querySelector('.heightMeasure').innerText || self.getLastPage().querySelector('.heightMeasure').textContent;
      if (text.length <= 0) {
        self.deleteLastPage();
      }
      self.saveStoryBody();
    };
  }
  
  getLastPage() {
    return this.pages[this.pages.length-1];
  }
  
  moveToEnd(page) {
    var range,selection;
    if (document.createRange) {
      range = document.createRange();//Create a range (a range is a like the selection but invisible)
      range.selectNodeContents(page);//Select the entire contents of the element with the range
      range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
      selection = window.getSelection();//get the selection object (allows you to change selection)
      selection.removeAllRanges();//remove any selections already made
      selection.addRange(range);//make the range you have just created the visible selection
    }
    else if (document.selection) { 
      range = document.body.createTextRange();//Create a range (a range is a like the selection but invisible)
      range.moveToElementText(page);//Select the entire contents of the element with the range
      range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
      range.select();//Select the range (make it the visible selection
    }
  }
  
  deleteLastPage() {
    let art = self.getLastPage();
    self.removeEmptyElements(art);
    art.parentNode.removeChild(art);
    self.pages.splice(-1,1);
    self.moveToEnd(self.getLastPage());
  }
  
  newPage() {
    let art = document.createElement('article');
    let div = document.createElement('div');
    div.setAttribute('contentEditable', true);
    div.classList.add('textPosition');
    div.classList.add('heightMeasure');
    art.appendChild(div)
    this.pages.push(art);
    document.querySelector('#content').append(art)
    this.addPageEvents(art);
    div.focus();
    return art;
  }
  
  connect_to_socket(url) {
    this.ws_open = true;
    this.socket = new WebSocket(url);
    this.socket.onopen = function() {
      console.log('socket opened');
      self.sendPing();
    };
    this.socket.onmessage = function(msg) {
      console.log(JSON.parse(msg.data));
      self.pingInterval = setTimeout(function() {self.sendPing();}, self.PING_INTERVAL_TIME);
    };
    
    this.socket.onerror = function(err) {
      console.error(err);
    };
    
    this.socket.onclose = function() {
      console.log("closed");
      clearTimeout(self.pingInterval);
    };
  }
  
  saveStoryBody() {
    if (this.ws_open) {
      var body = '';
      for (var i=0; i < self.pages.length; i++) {
        body += self.pages[i].innerHTML;
      }
      var story = {}
      story.ID = '5abd444d6b021182d093db25';
      story.Body = body;
      this.socket.send(JSON.stringify({Command:"saveBody", Data:story}));
    }
  }
  
  sendPing() {
    this.socket.send(JSON.stringify({Command:"ping"}));
  }
  
  paginate(story) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML= story;
    var pages = wrapper.querySelectorAll('.heightMeasure');
    for (var i=0; i < pages.length; i++) {
      var page = self.newPage();
      page.querySelector('.heightMeasure').innerHTML = pages[i].innerHTML;
    }
  }
  
  fetchStory(storyID) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        let story = JSON.parse(this.responseText);
        self.paginate(story.body);
        
      }
    };
    xhttp.open("GET", SERVICE_URL + '/story/' + storyID, true);
    xhttp.send();
  }
  
  fillNextPage() {
    
  }
  
  getFirstRange() {
    var sel = rangy.getSelection();
    return sel.rangeCount ? sel.getRangeAt(0) : null;
  }
      
  extractPositioning(str) {
    var regex = /<div class="textPosition[\sa-z]*?">(.*?)<\/div>/g;
    var matches = regex.exec(str);
    if (matches) {
      str = str.replace(regex, matches[1]);
    }
    regex = /<[^>]+>[ \n\r\t]*<\/[^>]+>/g;
    return str.replace(regex, '');
  }
  
  addMenuMouseEvents(element) {
    element.onclick = function(event) {
      event.preventDefault();
      var range = self.getFirstRange();
      if (element.querySelector('svg').classList.contains('fa-align-left')) {
        if (!range || (!range.startOffset && !range.endOffset)) {
          document.querySelector('#content article').classList.remove('left','right','center');
          document.querySelector('#content article').classList.add('left');
        } else {
          var text = range.extractContents();
          var temp = document.createElement('div');
          temp.appendChild(text);
          text = self.extractPositioning(temp.innerHTML);
          var positioner = document.createElement('div');
          positioner.classList.add('textPosition');
          positioner.classList.add('left');
          positioner.innerHTML = text;
          range.insertNode(positioner);            
        }
      }
      if (element.querySelector('svg').classList.contains('fa-align-center')) {
        if (!range || (!range.startOffset && !range.endOffset)) {
          document.querySelector('#content article').classList.remove('left','right','center');
          document.querySelector('#content article').classList.add('center');
        } else {
          var text = range.extractContents();
          var temp = document.createElement('div');
          temp.appendChild(text);
          text = self.extractPositioning(temp.innerHTML);
          var positioner = document.createElement('div');
          positioner.classList.add('textPosition');
          positioner.classList.add('center');
          positioner.innerHTML = text;
          range.insertNode(positioner);       
        }
      }
      if (element.querySelector('svg').classList.contains('fa-align-right')) {
        if (!range || (!range.startOffset && !range.endOffset)) {
          document.querySelector('#content article').classList.remove('left','right','center');
          document.querySelector('#content article').classList.add('right');
        } else {
          var text = range.extractContents();
          var temp = document.createElement('div');
          temp.appendChild(text);
          text = self.extractPositioning(temp.innerHTML);
          var positioner = document.createElement('div');
          positioner.classList.add('textPosition');
          positioner.classList.add('right');
          positioner.innerHTML = text;
          range.insertNode(positioner);       
        }
      }
      var tools = document.querySelectorAll('menuitem');
      for (var i=0; i < tools.length; i++) {
        tools[i].classList.remove('active');
      }
      this.classList.add('active');
    };
    
    element.onmousedown = function(event) {
      event.preventDefault();
    }
  }
}