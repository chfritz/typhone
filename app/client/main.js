
// var debug = "debug";
var debug;

// ---------------------------------------------------------

var expectedFile;
var buffer;
var buffered = 0;
function protocol(obj) {
    console.log("protocol" + JSON.stringify(obj));
    if (obj.cmd == "sending") {
        expectedFile = obj.file;
        buffer = new Uint8Array( expectedFile.size );
        buffered = 0;
    }
}

function receiveData(data) {
    // console.log("receiveData, " + data.byteLength);

    buffer.set( new Uint8Array( data ), buffered );
    buffered += data.byteLength;
    
    if (expectedFile && buffered == expectedFile.size) {
        console.log("done receiving");
        writeToDisk(expectedFile.name, buffer.buffer);
        expectedFile = null;
    }
}

function writeToDisk(name, data) {
    function errorHandler(err) {
        console.log(err);
    }

    navigator.webkitPersistentStorage.requestQuota(1 << 30, function(grantedBytes) {
        window.requestFileSystem(PERSISTENT, grantedBytes, function(fs) {
            console.log("grantedBytes: " + grantedBytes);
            fs.root.getFile(name, {create: true}, function(fileEntry) {
                // Create a FileWriter object for our FileEntry.
                fileEntry.createWriter(function(fileWriter) {

                    // we again, as on the sender side, need to go
                    // about in chunks, because the FileWriter doesn't
                    // like to write a lot all at once.
                    var written = 0;
                    var chunkSize = 1 << 20; // 1MB
                    function writeNext() {
                        fileWriter.write(
                            data.slice(
                                written,
                                Math.min(data.byteLength, written + chunkSize)));
                        written += chunkSize;
                    }                        

                    fileWriter.onwrite = function(e) {
                        if (written < data.byteLength) {
                            console.log('writing..');
                            writeNext();
                        } else {
                            console.log('Write completed.');
                        }
                    };
                    fileWriter.onerror = function(e) {
                        console.log('Write failed: ' + e.toString());
                    };

                    writeNext();
                    
                }, errorHandler);
            }, errorHandler);
        }, errorHandler);
    });
};


// ---------------------------------------------------------

Template.mobile.helpers({
    clipboard: function() {
        return Clipboard.find();
    },
    host: function() {
        // find the other computer in the connection list by
        // eliminating ourselves
        return _.find(this.connections, function(conn) {
            return conn.clientAddress != device.clientAddress;
        });
    }
});

var sessions = [];

Template.mobile.onRendered(function() {
    console.log("onRendered " + JSON.stringify(device));
    if (Meteor.isCordova) {
        if (Meteor.userId()) {
            subscribeUser();
        } else {
            Accounts.onLogin(function() {
                subscribeUser();
            });
        }

        if (cordova.InAppBrowser) {
            window.open = cordova.InAppBrowser.open;
        }
        console.log("this: " + JSON.stringify(_.keys(this)));
        console.log("Oauth: " + JSON.stringify(_.keys(Oauth)));
        console.log("cordova: " + JSON.stringify(_.keys(cordova)));
        console.log("plugins: " + JSON.stringify(_.keys(cordova.plugins)));
        console.log("navigator: " + JSON.stringify(navigator));
        
        window.resolveLocalFileSystemURI("file:///sdcard/", function(dirEntry) {
            console.log(dirEntry.name);

            function success(entries) {
                var i;
                for (i=0; i<entries.length; i++) {
                    console.log(entries[i].name);
                }
            }

            function fail(error) {
                alert("Failed to list directory contents: " + error.code);
            }

            // Get a directory reader
            var directoryReader = dirEntry.createReader();

            // Get a list of all the entries in the directory
            directoryReader.readEntries(success,fail);
        }, function(err) {
            console.log("error" + err);
        });


        console.log("querying");
        var query = Clipboard.find();
        query.observe({
            changed: function(newDoc, oldDoc) {
                console.log("change: " + JSON.stringify(newDoc));

                if (newDoc.connections.length < 2) { 
                    // Router.go('/');
                    // TODO: add a flash message or something?
                    // stop this subscription
                    Clipboard.remove(newDoc._id);
                } else {
                
                    if (newDoc.cmd == "clipboard") {
                        cordova.plugins.clipboard.copy(newDoc.text);

                    } else if (newDoc.cmd == "maps") {
                        window.open("geo:0,0?q=" + newDoc.text,
                                    '_system', 'location=yes');

                    } else if (newDoc.cmd == "url") {
                        window.open(newDoc.text, '_system');

                    } else if (newDoc.cmd == "tel") {
                        window.open("tel:" + newDoc.number,
                                    '_system', 'location=yes');

                    } else if (newDoc.cmd == "sms") {
                        console.log("sending sms");
                        sms.send(newDoc.number, newDoc.message, {},
                                 function() {
                                     console.log("sms sent");
                                 },
                                 function(e) {
                                     console.log("sms not sent: " + e);
                                 });
                    }
                }
            }
        });

        if (debug) {
            sessions.push(debug);
            Meteor.subscribe('clipboard', debug, device);
            // startRTC(false, result.text);
            new WebRTC(false, debug);
        }        
    }
});


Template.mobile.events({
    'click .qr': function() {
        cordova.plugins.barcodeScanner.scan(
            function (result) {
                // console.log("We got a barcode\n" +
                //             "Result: " + result.text + "\n" +
                //             "Format: " + result.format + "\n" +
                //             "Cancelled: " + result.cancelled);
                // Router.go("/page/"+ result.text);
                sessions.push(result.text);
                Meteor.subscribe('clipboard', result.text, device);
                // startRTC(false, result.text);
                new WebRTC(false, result.text, {
                    onText: function(text) {
                        console.log("received text: " + text);
                        protocol(JSON.parse(text));
                    },
                    onArrayBuffer: function(data) {
                        receiveData(data);
                    }
                });
            }, 
            function (error) {
                console.log("Scanning failed: " + error);
            }
        );
    },
    'click .remove': function() {
        console.log("remove " + JSON.stringify(this));
        Clipboard.remove(this._id);        
    }
});

// Template.mobile.helpers({
//     peers: function() {
//         var data = Clipboard.findOne();
//         if (data) {
//             return data.connections.length;
//         }
//     }
// });

// ---------------------------------------------------------

function subscribeUser() {
    var id = Meteor.userId();
    console.log("subscribing to user collection", id);
    sessions.push(id);
    Meteor.subscribe('clipboard', id);
}

rtc = null;
Template.web.onRendered(function() {
    // TODO: this creates too many collection (on per page load;
    // change that to once per established connection between
    // web+mobile)

    if (Meteor.userId()) {
        subscribeUser();
    } else {
        Accounts.onLogin(function() {
            subscribeUser();
        });
    }

    if (debug) {
        sessions.push(debug);
        Meteor.subscribe('clipboard', debug);
        // startRTC(false, result.text);
        rtc = new WebRTC(true, debug, {
            onConnection: function() {
                Session.set('webrtc', true);
            }
        });
    } else {
        Clipboard.insert({ text: "type here" }, function(err, id) {
            sessions.push(id);
            $('#qrcode').qrcode( { 
                text: id,
                render: 'canvas',
                size: 60,
                ecLevel: 'H',
                fill: "#000",
                // background: "#ffffff",
                radius: 2.0,
            });      
            Meteor.subscribe('clipboard', id);
            Signaling.insert({channel: id})
            // startRTC(true, id);
            rtc = new WebRTC(true, id, {
                onConnection: function() {
                    Session.set('webrtc', true);
                }
            });
        });
    }
    
    $("body").addClass("web");
});

Template.web.events({
    // 'keydown input': function(event, template) {
    //     if (event.keyCode == 13) {
    //         var val = template.$(event.target).val();
    //         Clipboard.update(Session.get('id'), {$set: {
    //             text: val,
    //             cmd: event.target.dataset.cmd
    //         }});
    //         return false;
    //     }
    // },
    'keydown .action': function(event, template) {
        if (event.keyCode == 13) {
            var form = template.$(event.target).closest('.form');
            var data = {cmd: event.target.dataset.cmd};
            form.find('[data-field]').each(function(index) {
                data[this.dataset.field] = $(this).val();
            });
            console.log(data);
            _.each(sessions, function(id) {
                Clipboard.update(id, {$set: data});
            });
            return false;
        }
    }

});

Session.set('webrtc', false);
Template.web.helpers({
    connections: function() {
        var data = Clipboard.findOne();
        console.log("data", data);
        if (data) {
            return _.map(data.connections, function(conn) {
                return { ip: conn.clientAddress,
                         agent: conn.httpHeaders["user-agent"],
                         device: conn.device };
            });
        }
    },
    webrtc: function() {
        return Session.get('webrtc');
    }
});

// ---------------------------------------------------------

Template.dropzone.onRendered(function() {
    new dragAndDrop({
        onComplete: function(files) {
            _.each(files, function(file, index) {
                if (file.size < 1000000000) {
                    console.log("upload", file);
                    if (rtc) {
                        // send metadata:
                        rtc.dataChannel.send(JSON.stringify({
                            cmd: "sending",
                            file: _.extend({}, file)
                        }));
                        // send data:
                        rtc.dataChannel.binaryType = 'arraybuffer';
                        var reader = new window.FileReader();
                        reader.onload = function(e) {
                            console.log("sending");
                            // rtc.dataChannel.send(e.target.result);
                            // #HERE: chunk file down into 16kb messages
                            // also add a response from receiver before
                            // proceeding                           
                            var chunkSize = 1 << 14; // 16KB
                            var maxBuffer = chunkSize * 10;
                            var buffer = e.target.result;
                            
                            // for (var i = 0; i < file.size; i += chunkSize) {
                            //     console.log("offset: ", i);
                            //     rtc.dataChannel.send(
                            //         (new Int8Array(buffer, i,
                            //                        Math.min(chunkSize, file.size - i)))
                            //             .buffer
                            //     );
                            // }

                            var i = 0;
                            function sendNextChunk() {
                                $('#upload .progress').progress({
                                    percent: Math.round(i * 100 / file.size)
                                });
                                if (rtc.dataChannel.bufferedAmount < maxBuffer) {
                                    rtc.dataChannel.send(
                                        // (new Uint8Array(buffer, i,
                                        //                 Math.min(chunkSize, file.size - i)))
                                        // .buffer
                                        buffer.slice(i, Math.min(file.size, i + chunkSize))
                                    );
                                    i += chunkSize;
                                }
                                if (i < file.size) {
                                    window.setTimeout(sendNextChunk, 1);
                                }
                            }
                            
                            // rtc.dataChannel.onbufferedamountlow = sendNextChunk;
                            sendNextChunk();
                        }
                        reader.readAsArrayBuffer(file);
                    }
                } else {
                    alert("File " + file + " is too large (> 1000MB).");
                }
            });
        },
        style: {
        },
        onEnter: function() {
            console.log("enter");
        }
    }).add('#upload');
});
