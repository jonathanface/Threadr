const HTML_DIR = 'html/';
const SERVICE_URL = 'api/';

var drafty;
      
function getHTML(file) {
  return new Promise(resolve => {
    var xhttp = new XMLHttpRequest();
    var html = xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        resolve(this.responseText);
      }
    };
    xhttp.open("GET", HTML_DIR + file, true);
    xhttp.send();
  });
}     
      
window.onload = function() {
  var form = document.getElementById("login");
  form.onsubmit=function(event) {
    event.preventDefault();
    var formData = new FormData(form);
    console.log(formData.entries());
    var actionPath = form.getAttribute("action");
    var xhr = new XMLHttpRequest;
    xhr.open(form.getAttribute("method"), actionPath);
    xhr.send(formData);
  };
  
  drafty = new Drafty();
  drafty.fetchStory('5abd444d6b021182d093db25');
  
};
