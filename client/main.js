
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
        if (data) {
            return _.map(data.connections, function(conn) {
                return { ip: conn.clientAddress,
                         agent: conn.httpHeaders["user-agent"],
                         device: conn.device };
            });
        }
    }
});
