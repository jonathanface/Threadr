class Drafty {
  
  constructor() {
    this.launchWriter();
    this.socketURL;
    this.ws_open = false;
    this.socket;
    this.pingInterval;
    this.PING_INTERVAL_TIME = 3000;
  }
  
  async launchWriter() {
    var self = this;
    try {
      let html = await getHTML('draft.html');
      document.querySelector('#content').innerHTML = html;
      document.querySelector('#content article').onkeydown = function(event) {
        if (event.keyCode == 9) {
          event.preventDefault();
        }
      };
      document.querySelector('#content article').onkeyup = function(event) {
        if (event.keyCode == 9) {
          document.execCommand('insertHTML', false, '&#009');
        }
        if (event.keyCode == 13) {
          document.execCommand('insertHTML', false, '&#009');
        }
        self.saveStoryBody()
      };
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
  
  connect_to_socket(url) {
    this.ws_open = true;
    var self = this;
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
      var html = document.querySelector('article').innerHTML;
      var story = {}
      story.ID = '5abd444d6b021182d093db25';
      story.Body = html;
      this.socket.send(JSON.stringify({Command:"saveBody", Data:story}));
    }
  }
  
  sendPing() {
    this.socket.send(JSON.stringify({Command:"ping"}));
  }
  
  fetchStory(storyID) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        let story = JSON.parse(this.responseText);
        document.querySelector('#content article').innerHTML = story.body;
      }
    };
    xhttp.open("GET", SERVICE_URL + '/story/' + storyID, true);
    xhttp.send();
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
    var self = this;
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