
var logger = function(a,b,c) {
    console.log(a,b,c);
};
// var logger = function() {};
var chunkSize = (1 << 14) - 1; // 16KB

function toObject(x) {
    return JSON.parse(JSON.stringify(x));
}

// run new WebRTC(true, someSecretId) to initiate a call
WebRTC = class {

    constructor(isCaller, channel, handlers) {
        logger("starting RTC on channel: " + channel);
        handlers = handlers || {};
        
        var peerConnection = window.RTCPeerConnection
            || window.mozRTCPeerConnection
            || window.webkitRTCPeerConnection
            || window.msRTCPeerConnection;
        var sessionDescription = window.RTCSessionDescription
            || window.mozRTCSessionDescription
            || window.webkitRTCSessionDescription
            || window.msRTCSessionDescription;
        var getUserMedia = navigator.getUserMedia
            || navigator.mozGetUserMedia
            || navigator.webkitGetUserMedia
            || navigator.msGetUserMedia;

        var pc = this.pc = new peerConnection(
            // configuration,
            {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]},
            // {optional: [{RtpDataChannels: true}]}
            null
        );
        logger("created peerConnection", pc);
        
        // send any ice candidates to the other peer
        pc.onicecandidate = function (evt) {
            if (evt.candidate) {
                logger("onICECandidate", evt);
                Signaling.insert({
                    channel: channel,
                    type: (isCaller ? "caller" : "receiver"),
                    candidate: toObject(evt.candidate) // .toJSON()
                });
            }
        };

        // once remote stream arrives, show it in the remote video element
        // pc.onaddstream = function (evt) {
        //     remoteView.src = URL.createObjectURL(evt.stream);
        // };

        // get the local stream, show it in the local video element and send it
        // getUserMedia({ "audio": true, "video": true }, function (stream) {
        //     selfView.src = URL.createObjectURL(stream);
        //     pc.addStream(stream);
        // });

        var sendChannel;
        pc.ondatachannel = function(event) {
            logger("got data channel");
            // sendChannel.send("ok");
            receiveChannel = event.channel;
            receiveChannel.onmessage = function(event){
                // logger("got message");
                var handler;
                if (event.data instanceof ArrayBuffer) {
                    handler = "onArrayBuffer";
                    // sendChannel.send("ok");
                } else if (event.data instanceof Blob) {
                    handler = "onBlob";
                } else if (typeof event.data === "string") {
                    handler = "onText";
                }
                // logger("message type: " + handler);
                if (handler && handlers[handler]) {
                    handlers[handler](event.data);
                }
            };

            if (handlers.onDataChannel) {
                handlers.onDataChannel(event);
            }            
        };

        sendChannel = this.sendChannel =
            pc.createDataChannel("sendDataChannel_caller_" + isCaller,
                                 {reliable: true});
        // sendChannel.binaryType = 'arraybuffer';
        // sendChannel.send(data); // example

        sendChannel.onclose = function(event) {
            if (handlers.onClose) {
                handlers.onClose(event);
            }            
        }
        
        // ---------------------------------------------------------
        // Signaling

        function update(id, data) {
            logger("signal", data);
            // caller
            if (isCaller && data.answer) {
                pc.setRemoteDescription(
                    new sessionDescription(data.answer),
                    function() {
                        logger("RTC: we are ready!");
                        if (handlers.onConnection) {
                            handlers.onConnection(this);
                        }
                    }, function(err) {
                        logger("couldn't set remote description", err);
                    });
            }
            // receiver
            if (!isCaller && data.offer) {
                logger("we got an offer");
                pc.setRemoteDescription(
                    new sessionDescription(data.offer),
                    function() {
                        logger("set remote description from offer");
                        pc.createAnswer(function(description) {
                            logger("answer: " + JSON.stringify(description));
                            // answer = description;
                            pc.setLocalDescription(description, function() {
                                logger("set local description");
                                Signaling.insert({
                                    channel: channel,
                                    answer: toObject(description) //.toJSON()
                                });
                            }, function(err) {
                                logger("couldn't set local description", err);
                            });
                        }, function(err) {
                            logger("couldn't create answer", err);
                        });
                    }, function(err) {
                        logger("couldn't set remote description", err);
                    }
                );
            }
            // both
            if (data.candidate &&
                // don't add our own candidates
                ((!isCaller && data.type == "caller")
                 || (isCaller && data.type == "receiver"))) {
                pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
        
        Meteor.subscribe('signaling', channel, isCaller);
        
        Signaling.find({channel: channel}).observeChanges({
            added: update,
            changed: update
        });

        // ---------------------------------------------------------
        // Caller
        
        if (isCaller) {
            // make offer
            pc.createOffer(function(description) {
                // offer = description;
                logger("createdOffer", description);
                pc.setLocalDescription(description, function() {
                    Signaling.insert({
                        channel: channel,
                        offer: toObject(description) //.toJSON()
                    });
                }, function(err) {
                    logger("couldn't set local description", err);
                });
            }, function(err) {
                logger("couldn't create offer", err);
            });
        }

        

    }

    get peerConnection() { return this.pc; }
    get dataChannel() { return this.sendChannel; }

    // ------------------------------------------------------------
    // convenience functions
    
    /** send a file in chunks */   
    sendFile(file, callbacks) {
        var dataChannel = this.sendChannel;
        // send metadata:
        dataChannel.send(JSON.stringify({
            cmd: "sending",
            file: _.extend({}, file)
        }));
        // send data:
        dataChannel.binaryType = 'arraybuffer';
        var reader = new window.FileReader();
        reader.onload = function(e) {
            var maxBuffer = chunkSize * 10;
            var buffer = e.target.result;
            
            var i = 0;
            function sendNextChunk() {
                callbacks.onProgress && callbacks.onProgress(i);
                if (dataChannel.bufferedAmount < maxBuffer) {
                    dataChannel.send(
                        buffer.slice(i, Math.min(file.size, i + chunkSize))
                    );
                    i += chunkSize;
                }
                if (i < file.size) {
                    window.setTimeout(sendNextChunk, 1);
                } else {
                    callbacks.onComplete && callbacks.onComplete(file);
                }
            }
            sendNextChunk();
        }
        reader.readAsArrayBuffer(file);
    }

    /** send a string in chunks */
    sendText(text, callbacks) {
        callbacks = callbacks || {};
        var dataChannel = this.sendChannel;
        var i = 0;
        function sendNextSlice() {
            dataChannel.send(
                text.slice(i, Math.min(text.length, i + chunkSize))
            );
            i += chunkSize;
            if (i < text.length) {
                window.setTimeout(sendNextSlice, 1);
            } else {
                callbacks.onComplete && callbacks.onComplete(text);
            }
        }
        sendNextSlice();
    }    
};
