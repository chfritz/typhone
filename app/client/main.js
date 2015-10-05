
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
                    if (newDoc.callerCandidate) {
                        // TODO: only if new
                        console.log("adding ice candidate: " + newDoc.callerCandidate);
                        pc.addIceCandidate(new RTCIceCandidate(JSON.parse(newDoc.callerCandidate)));
                    }

                    if (newDoc.offer && !offer) {
                        console.log("got offer:" + newDoc.offer);
                        offer = newDoc.offer;
                        console.log(JSON.parse(newDoc.offer));
                        console.log(pc.setRemoteDescription);
                        var rsd = new sessionDescription(JSON.parse(newDoc.offer));
                        console.log(rsd);
                        pc.setRemoteDescription(rsd, function() {
                            console.log("set remote description");
                            pc.createAnswer(function(description) {
                                console.log("answer: " + JSON.stringify(description));
                                answer = description;
                                pc.setLocalDescription(description, function() {
                                    console.log("set local description");
                                    var data = {
                                        answer: JSON.stringify(description),
                                    };
                                    console.log(sessions);                                   
                                    _.each(sessions, function(id) {
                                        console.log(id);                                   
                                        Clipboard.update(id, {$set: data});
                                    });
                                }, function() {
                                    console.log("couldn't set local description");
                                });
                            }, function() {
                                console.log("couldn't create answer");
                            });
                        }, function(err) {
                            console.log("couldn't set remote description");
                        });
                    }
                }
            }
        });
        
        startRTC(false);
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

        if (Meteor.userId()) {
            subscribeUser();
        } else {
            Accounts.onLogin(function() {
                subscribeUser();
            });
        }
    });

    startRTC(true);
    
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

Template.web.helpers({
    connections: function() {
        var data = Clipboard.findOne();
        console.log("data", data);
        if (data) {
            if (offer == null
                && data.connections
                && data.connections.length > 1) {
                makeOffer();
            }
            if (answer == null
                && data.answer) {
                pc.setRemoteDescription(
                    new sessionDescription(JSON.parse(data.answer)),
                    function() {
                        console.log("RTC: we are ready!");
                    }, function(err) {
                        console.log("couldn't set remote description");
                    });
            }
            if (data.responderCandidate) {
                // TODO: only if new
                pc.addIceCandidate(new RTCIceCandidate(JSON.parse(data.responderCandidate)));
            }
            return _.map(data.connections, function(conn) {
                return { ip: conn.clientAddress,
                         agent: conn.httpHeaders["user-agent"],
                         device: conn.device };
            });
        }
    }
});

// ---------------------------------------------------------

var peerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || 
    window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var sessionDescription = window.RTCSessionDescription ||
    window.mozRTCSessionDescription ||
    window.webkitRTCSessionDescription || window.msRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia ||
    navigator.webkitGetUserMedia || navigator.msGetUserMedia;

sendChannel = null;
pc = null;
var configuration = {};
offer = null;
answer = null;

// run start(true) to initiate a call
startRTC = function(isCaller) {
    console.log("starting RTC");
    pc = new peerConnection(
        // configuration,
        {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]},
        // {optional: [{RtpDataChannels: true}]}
        null
    );
    console.log(pc);
    
    // send any ice candidates to the other peer
    pc.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log("onICECandidate", evt);
            // signalingChannel.send(JSON.stringify({ "candidate": evt.candidate }));
            var data = {};
            if (isCaller) {
                data.callerCandidate = JSON.stringify(evt.candidate);
            } else {
                data.responderCandidate = JSON.stringify(evt.candidate);
            };
            console.log("setting callerCandidate", data);           
            _.each(sessions, function(id) {
                Clipboard.update(id, {$set: data});
            });
        }
    };

    // once remote stream arrives, show it in the remote video element
    // pc.onaddstream = function (evt) {
    //     remoteView.src = URL.createObjectURL(evt.stream);
    // };

    // get the local stream, show it in the local video element and send it
    // navigator.getUserMedia({ "audio": true, "video": true }, function (stream) {
    //     selfView.src = URL.createObjectURL(stream);
    //     pc.addStream(stream);

    //     if (isCaller)
    //         pc.createOffer(gotDescription);
    //     else
    //         pc.createAnswer(pc.remoteDescription, gotDescription);

    //     function gotDescription(desc) {
    //         pc.setLocalDescription(desc);
    //         signalingChannel.send(JSON.stringify({ "sdp": desc }));
    //     }
    // });

    pc.ondatachannel = function(event) {
        console.log("got data channel");
        receiveChannel = event.channel;
        receiveChannel.onmessage = function(event){
            console.log(event, event.data);
        };
    };
    
    sendChannel = pc.createDataChannel("sendDataChannel", {reliable: false});
    // sendChannel.binaryType = 'arraybuffer';
    
    // document.querySelector("button#send").onclick = function (){
    //     var data = document.querySelector("textarea#send").value;
    //     sendChannel.send(data);
    // };
}

makeOffer = function() {
    pc.createOffer(function(description) {
        offer = description;
        console.log("createOffer", description, JSON.stringify(description));
        pc.setLocalDescription(description, function() {
            // pc2.setRemoteDescription(offer, onPc2RemoteDescriptionSet, onError);
            var data = {
                offer: JSON.stringify(description),
            };
            _.each(sessions, function(id) {
                Clipboard.update(id, {$set: data});
            });
        }, function(err) {
            console.log("couldn't set local description", err);
        });
    }, function(err) {
        console.log(err);
    });
}
