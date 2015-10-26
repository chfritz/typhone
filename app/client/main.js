
function errorHandler(err) {
    console.log(err);
}

rtc = null;

// ---------------------------------------------------------

var reactive = {
    ls: new ReactiveVar(null),
    uploading: new ReactiveVar(false),
    downloading: new ReactiveVar(false),
    disabled: new ReactiveVar("disabled") // set to "" when active
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

        // console.log("protocol" + JSON.stringify(obj));
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
            downloadFile(obj.path);
        }
    },
    web: function(obj) {
        if (obj.cmd == "sending") {
            reactive.downloading.set({
                expectedFile: obj.file,
                buffered: 0
            });
            buffer = new Uint8Array( obj.file.size );
        } else if (obj.response) {
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

blob = null;
function receiveDataWeb(data) {
    // console.log("receiveData, " + data.byteLength);

    downloading = reactive.downloading.get()
    buffer.set( new Uint8Array( data ), downloading.buffered );
    downloading.buffered += data.byteLength;
    
    $('.downloading.progress').progress({
        percent: Math.round(downloading.buffered * 100
                            / downloading.expectedFile.size)
    });

    if (downloading
        && downloading.expectedFile
        && downloading.buffered == downloading.expectedFile.size) {
        
        console.log("done receiving");
        blob = new Blob([buffer], {type: 'application/octet-binary'});
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = downloading.expectedFile.name;
        a.click();
        URL.revokeObjectURL(url);
        downloading = false;
    }   
    reactive.downloading.set(downloading);
}

var fs;
var cwd;
function getFS() {
    // navigator.webkitPersistentStorage.requestQuota(1 << 30, function(grantedBytes) {
    var grantedBytes = 1 << 30;
    window.requestFileSystem(PERSISTENT, grantedBytes, function(_fs) {
        console.log("grantedBytes: " + grantedBytes);
        fs = _fs;
        cwd = fs.root;
    }, errorHandler);
    // });
}

function downloadFile(fileName) {
    cwd.getFile(fileName, {}, function(fileEntry) {
        fileEntry.file(function(file) {
            rtc.sendFile(file, {
                onProgress: function(i) {
                    console.log(i * 100 / file.size);
                },
                onComplete: function(file) {
                    console.log("completed sending file", file);
                }
            });
        }, errorHandler);
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
    cwd.getFile(name, {create: true}, function(fileEntry) {
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
    console.log("start");
    console.log(Meteor.isCordova);
    if (Meteor.isCordova) {
        if (cordova.platformId == "ios"
            && cordova.plugins.iosrtc.registerGlobals) {
            console.log("detected iOS, registering RTC plugin globally");
            cordova.plugins.iosrtc.registerGlobals();
        // } else {
            // TODO: do this for iOS, too
        }
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
            subscribeUser(device);
        } else {
            Accounts.onLogin(function() {
                subscribeUser(device);
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
                startWebRTC(result.text);
            }, 
            function (error) {
                console.log("Scanning failed: " + error);
            }
        );
    },
    'click .remove': function() {
        console.log("remove " + JSON.stringify(this));
        Clipboard.remove(this._id);
        rtc.dataChannel.close();
        rtc.peerConnection.close();
    }
});

Template.layout.events({
    'click .refresh': function() {
        console.log("refresh");
        window.location.reload();
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

function subscribeUser(device) {
    var id = Meteor.userId();
    console.log("subscribing to user collection", id);
    sessions.push(id);
    if (Meteor.isCordova) {
        Meteor.subscribe('clipboard', undefined, device);
    } else {
        Meteor.subscribe('clipboard');
    }
    startWebRTC(id);
}

function startWebRTC(id) {

    console.log("startWebRTC");
    if (Meteor.isCordova) {
        rtc = new WebRTC(false, id, {
            onText: function(text) {
                // console.log("received text: " + text);
                protocol.mobile(JSON.parse(text));
            },
            onArrayBuffer: function(data) {
                receiveData(data);
            }
        });
    } else {
        rtc = new WebRTC(true, id, {
            onConnection: function() {
                Session.set('webrtc', true);
            },
            onDataChannel: function() {
                rtc.dataChannel.send(JSON.stringify({cmd: "ls"}));
            },
            onText: function(text) {
                // console.log("got text:", text);
                protocol.web(JSON.parse(text));
            },
            onArrayBuffer: function(data) {
                receiveDataWeb(data);
            },
            onClose: function() {
                console.log("onClose");
                reactive.ls.set(null);
                reactive.disabled.set("disabled");
            }
        });
    }
};


Template.web.onRendered(function() {
    // TODO: this creates too many collection (on per page load;
    // change that to once per established connection between
    // web+mobile)

    if (Meteor.userId()) {
        subscribeUser();
    } else {
        Accounts.onLogin(function() {
            subscribeUser();
            $('#qrcode').hide();            
        });

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
            startWebRTC(id);
        });

    }

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
        // console.log("data", data);
        if (data) {
            var connections = _.reduce(data.connections, function(memo, conn) {
                if (conn.device) {
                    memo.push({ ip: conn.clientAddress,
                                agent: conn.httpHeaders["user-agent"],
                                device: conn.device });
                }
                return memo;
            }, []);
            console.log("connections", connections);
            if (connections.length > 0) {
                reactive.disabled.set("");
            } else {
                reactive.disabled.set("disabled");
            }
            return connections;
        }
    },
    webrtc: function() {
        return Session.get('webrtc');
    },
    reactive: function() {
        // usage: {{reactive "ls" "path"}}
        var item = reactive[arguments[0]].get();
        for (i = 1; item && i < arguments.length-1; i++) {
            item = item[arguments[i]];
        }
        return item;
    },
    dropHandlers: function() {
        return {
            onDrop: function(files) {
                _.each(files, function(file, index) {
                    if (file.size < 1000000000) {
                        console.log("upload", file);
                        if (rtc) {
                            reactive.uploading.set(file);
                            rtc.sendFile(file, {
                                onProgress: function(i) {
                                    $('.uploading.progress').progress({
                                        percent: Math.round(i * 100 / file.size)
                                    });
                                },
                                onComplete: function(file) {
                                    console.log("completed upload of file", file);
                                    reactive.uploading.set(false);
                                    // update file listing
                                    rtc.dataChannel.send(JSON.stringify({cmd: "ls"}));
                                }
                            });
                        }
                    } else {
                        alert("File " + file + " is too large (> 1000MB).");
                    }
                });
            }
        }
    }
});

// ---------------------------------------------------------

// Template.dropzone.onRendered(function() {
//     new dragAndDrop({
//         onComplete: function(files) {
//             _.each(files, function(file, index) {
//                 if (file.size < 1000000000) {
//                     console.log("upload", file);
//                     if (rtc) {
//                         rtc.sendFile(file, {
//                             onProgress: function(i) {
//                                 $('#upload > .progress').progress({
//                                     percent: Math.round(i * 100 / file.size)
//                                 });
//                             },
//                             onComplete: function(file) {
//                                 console.log("completed upload of file", file);
//                             }
//                         });
//                     }
//                 } else {
//                     alert("File " + file + " is too large (> 1000MB).");
//                 }
//             });
//         },
//         style: {
//         },
//         onEnter: function() {
//             console.log("enter");
//         }
//     }).add('#upload');
// });
