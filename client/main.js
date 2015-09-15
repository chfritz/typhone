

// Template.mobile.helpers({
//     clipboard: function() {
//         var c = Clipboard.findOne();
//         if (c) {
//             return c.text;
//         }
//     }
// });

Template.mobile.onRendered(function() {
    console.log("onRendered " + JSON.stringify(device));
    if (Meteor.isCordova) {
        console.log("querying");
        var query = Clipboard.find();
        query.observe({
            changed: function(newDoc, oldDoc) {
                console.log("change: " + JSON.stringify(newDoc));

                if (newDoc.connections.length < 2) {
                    // TODO: add a flash message or something?
                    Router.go('/');
                } else {
                
                    if (newDoc.cmd == "clipboard") {
                        cordova.plugins.clipboard.copy(newDoc.text);

                    } else if (newDoc.cmd == "maps") {
                        cordova.InAppBrowser.open("geo:0,0?q=" + newDoc.text,
                                                  '_system', 'location=yes');

                    } else if (newDoc.cmd == "url") {
                        cordova.InAppBrowser.open(newDoc.text,
                                                  '_system', 'location=yes');

                    } else if (newDoc.cmd == "tel") {
                        cordova.InAppBrowser.open("tel:" + newDoc.number,
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
                Router.go("/page/"+ result.text);
            }, 
            function (error) {
                console.log("Scanning failed: " + error);
            }
        );
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

Template.web.onRendered(function() {
    Clipboard.insert({ text: "type here" }, function(err, id) {
        Session.set('id', id);
        $('#qrcode').qrcode( { 
            text: id,
            render: 'canvas',
            size: 60,
            ecLevel: 'H',
            fill: "#000",
            // background: "#ffffff",
            radius: 0.0,
        });

        Meteor.subscribe('clipboard', id);
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
            Clipboard.update(Session.get('id'), {$set: data});
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
