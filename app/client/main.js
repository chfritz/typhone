
function errorHandler(err) {
    console.log(err);
}

rtc = null;

// ---------------------------------------------------------

var reactive = {
    ls: new ReactiveVar(null)
};

var expectedFile;
var buffer;
var buffered = 0;
var protocol = {
    mobile: function(obj) {

        // get a listing and send it
        function sendLS() {
            ls(function(list) {
                if (cwd.fullPath != "/") {
                    list.push({
                        name: "..",
                        isFile: false,
                        isDirectory: true
                    });
                }
                var string = JSON.stringify({
                    response: "ls",
                    path: cwd.fullPath,
                    data: _.sortBy(list, "name")
                }); 
                console.log(string);
                rtc.sendText(string);
            });
        }

        console.log("protocol" + JSON.stringify(obj));
        if (obj.cmd == "sending") {
            expectedFile = obj.file;
            buffer = new Uint8Array( expectedFile.size );
            buffered = 0;
        } else if (obj.cmd == "ls") {
            sendLS();
        } else if (obj.cmd == "cd") {
            cd(obj.path, function() {
                sendLS();
            });
        } else if (obj.cmd == "get") {
            // #HERE: read file obj.name and send it
        }
    },
    web: function(obj) {
        if (obj.response) {
            if (reactive[obj.response]) {
                reactive[obj.response].set(obj);
            } else {
                console.log("unrecognized response", obj);
            }
        }
    }
};

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

var fs;
var cwd;
function getFS() {
    navigator.webkitPersistentStorage.requestQuota(1 << 30, function(grantedBytes) {
        window.requestFileSystem(PERSISTENT, grantedBytes, function(_fs) {
            console.log("grantedBytes: " + grantedBytes);
            fs = _fs;
            cwd = fs.root;
        }, function(err) {
            console.log(err);
        });
    });
}

function cd(path, callback) {
    cwd.getDirectory(path, {create: false}, function(dir) {
        console.log("cd'ed to " + dir.name);
        cwd = dir;
        callback();
    }, errorHandler);
}

function ls(callback) {
    var dirReader = cwd.createReader();
    var entries = [];
    
    function toArray(list) {
        return Array.prototype.slice.call(list || [], 0);
    }

    // Call the reader.readEntries() until no more results are returned.
    var readEntries = function() {
        dirReader.readEntries (function(results) {
            if (!results.length) {
                callback(entries.sort());
            } else {
                entries = entries.concat(toArray(results));
                readEntries();
            }
        }, errorHandler);
    };
    
    readEntries(); // Start reading dirs.   
}

function writeToDisk(name, data) {

    // navigator.webkitPersistentStorage.requestQuota(1 << 30, function(grantedBytes) {
        // window.requestFileSystem(PERSISTENT, grantedBytes, function(fs) {
            // console.log("grantedBytes: " + grantedBytes);
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
};


// ---------------------------------------------------------

Meteor.startup(function() {
    if (Meteor.isCordova) {
        getFS();
        // $('head').append('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">')
    }
});

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
                rtc = new WebRTC(false, result.text, {
                    onText: function(text) {
                        console.log("received text: " + text);
                        protocol.mobile(JSON.parse(text));
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
        // Signaling.insert({channel: id})
        // startRTC(true, id);
        rtc = new WebRTC(true, id, {
            onConnection: function() {
                Session.set('webrtc', true);
            },
            onDataChannel: function() {
                console.log("ls");
                rtc.dataChannel.send(JSON.stringify({cmd: "ls"}));
            },
            onText: function(text) {
                console.log("got text:", text);
                protocol.web(JSON.parse(text));
            }

        });
    });
    
    $("body").addClass("web");
});

Template.web.events({
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
    },
    'click .files .item': function() {
        console.log('clicked on', this);
        if (this.isDirectory) {
            rtc.dataChannel.send(JSON.stringify({
                cmd: "cd",
                path: this.name
            }));
        } else if (this.isFile) {
            rtc.dataChannel.send(JSON.stringify({
                cmd: "get",
                path: this.name
            }));
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
    },
    reactive: function(field) {
        return reactive[field].get();
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
                        rtc.sendFile(file, {
                            onProgress: function(i) {
                                $('#upload > .progress').progress({
                                    percent: Math.round(i * 100 / file.size)
                                });
                            },
                            onComplete: function(file) {
                                console.log("completed upload of file", file);
                            }
                        });
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
