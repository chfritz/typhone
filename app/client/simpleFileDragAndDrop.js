/*

  (MIT License)

  Copyright (c) 2012 Christian Fritz

  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


  Example usage:
    
$(document).ready(function() {
    var dd = new dragAndDrop({
        onComplete: function(files) {
            for (var i = 0; i < files.length; i++) {
                // Only process csv files.
                if (!f.type.match('text/csv')) {
                    continue;
                }
                var reader = new FileReader();
                reader.onloadend = function(event) {
                    var all = $.csv.toObjects(event.target.result);
                    // do something with file content
                }
             }
        }
     });

     dd.add('upload-div'); // add to an existing div, turning it into a drop container
});

*/

dragAndDrop = function(conf){

    callback = conf.onComplete;
    fnOnDrop = conf.onDrop;

    var dropContainer;
    // this.htmlnodeid = "";

    handleDrop = function(event){
        dropContainer = event.target;
        event.stopPropagation();
        event.preventDefault();
        if (fnOnDrop) {
            fnOnDrop(dropContainer);
        }
        build(event);
        return false;
    };

    build = function(event){
        var files = event.dataTransfer.files;
        callback(files);
    }

    /**
     * add another html node to allow drops on
     * @param {Object} htmlnode
     */
    this.add = function(selector){
        $(selector).each(function() {
            // this.htmlnodeid = htmlnodeid;
            var dropContainer = this;
            console.log(dropContainer);
            
            // document.getElementById(dropContainer.id).className =
            // conf.style.normal;

            // console.log(dropContainer);

            window.addEventListener("dragenter", function(event){
                // document.getElementById(dropContainer.id).className = conf.style.highlight;
                if (conf.style.highlight) {
                    dropContainer.addClass(conf.style.highlight);
                }
                if (conf.onEnter) {
                    conf.onEnter();
                }
                return false;
            }, false);

            dropContainer.addEventListener("dragover", function(event){
                // document.getElementById(dropContainer.id).className = conf.style.highlight_more;
                if (conf.style.highlight_more) {
                    dropContainer.addClass(conf.style.highlight_more);
                }
                event.stopPropagation();
                event.preventDefault();
                return false;
            }, false);

            dropContainer.addEventListener("dragexit", function(event){
                // document.getElementById(dropContainer.id).className = conf.style.normal;
                if (conf.style.highlight) {
                    dropContainer.removeClass(conf.style.highlight);
                }
                if (conf.style.highlight_more) {
                    dropContainer.removeClass(conf.style.highlight_more);
                }
                return false;
            }, false);

            dropContainer.addEventListener("drop", function(event){
                // document.getElementById(dropContainer.id).className = conf.style.normal;
                if (conf.style.highlight) {
                    dropContainer.removeClass(conf.style.highlight);
                }
                if (conf.style.highlight_more) {
                    dropContainer.removeClass(conf.style.highlight_more);
                }
                handleDrop(event);
            }, false);
        });
    }
}
