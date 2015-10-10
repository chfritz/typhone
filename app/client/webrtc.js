
// run new WebRTC(true, someSecretId) to initiate a call
WebRTC = class {

    constructor(isCaller, channel, handlers) {
        console.log("starting RTC on channel: " + channel);
        handlers = handlers || {};
        
        var peerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection
            || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
        var sessionDescription = window.RTCSessionDescription ||
            window.mozRTCSessionDescription ||
            window.webkitRTCSessionDescription || window.msRTCSessionDescription;
        var getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia
            || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

        var pc = this.pc = new peerConnection(
            // configuration,
            {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]},
            // {optional: [{RtpDataChannels: true}]}
            null
        );
        console.log("created peerConnection", pc);
        
        // send any ice candidates to the other peer
        pc.onicecandidate = function (evt) {
            if (evt.candidate) {
                console.log("onICECandidate", evt);
                Signaling.insert({
                    channel: channel,
                    type: (isCaller ? "caller" : "receiver"),
                    candidate: evt.candidate.toJSON()
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

        pc.ondatachannel = function(event) {
            console.log("got data channel");
            receiveChannel = event.channel;
            receiveChannel.onmessage = function(event){
                console.log("got message");
                var handler;
                if (event.data instanceof ArrayBuffer) {
                    handler = "onArrayBuffer";
                } else if (event.data instanceof Blob) {
                    handler = "onBlob";
                } else if (typeof event.data === "string") {
                    handler = "onText";
                }
                console.log("message type: " + handler);
                if (handler && handlers[handler]) {
                    handlers[handler](event.data);
                }
            };
        };
        
        this.sendChannel =
            pc.createDataChannel("sendDataChannel", {reliable: true});
        // sendChannel.binaryType = 'arraybuffer';
        // sendChannel.send(data); // example

        if (isCaller) {
            // make offer
            pc.createOffer(function(description) {
                // offer = description;
                console.log("createdOffer", description);
                pc.setLocalDescription(description, function() {
                    Signaling.insert({
                        channel: channel,
                        offer: description.toJSON()
                    });
                }, function(err) {
                    console.log("couldn't set local description", err);
                });
            }, function(err) {
                console.log("couldn't create offer", err);
            });
        }

        
        // ---------------------------------------------------------
        // Signaling

        function update(id, data) {
            console.log("signal", data);
            // caller
            if (isCaller && data.answer) {
                pc.setRemoteDescription(
                    new sessionDescription(data.answer),
                    function() {
                        console.log("RTC: we are ready!");
                        if (handlers.onConnection) {
                            handlers.onConnection(this);
                        }
                    }, function(err) {
                        console.log("couldn't set remote description", err);
                    });
            }
            // receiver
            if (!isCaller && data.offer) {
                console.log("we got an offer");
                pc.setRemoteDescription(
                    new sessionDescription(data.offer),
                    function() {
                        console.log("set remote description from offer");
                        pc.createAnswer(function(description) {
                            console.log("answer: " + JSON.stringify(description));
                            // answer = description;
                            pc.setLocalDescription(description, function() {
                                console.log("set local description");
                                Signaling.insert({
                                    channel: channel,
                                    answer: description.toJSON()
                                });
                            }, function(err) {
                                console.log("couldn't set local description", err);
                            });
                        }, function(err) {
                            console.log("couldn't create answer", err);
                        });
                    }, function(err) {
                        console.log("couldn't set remote description", err);
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
        
        Signaling.find({channel: channel}).observeChanges({
            added: update,
            changed: update
        });
        Meteor.subscribe('signaling', channel);
    }

    get peerConnection() { return this.pc; }
    get dataChannel() { return this.sendChannel; }
    
};


