

// Template.mobile.helpers({
//     clipboard: function() {
//         var c = Clipboard.findOne();
//         if (c) {
//             return c.text;
//         }
//     }
// });

Template.mobile.onRendered(function() {
    console.log("onRendered");
    if (Meteor.isCordova) {
        console.log("querying");
        var query = Clipboard.find();
        query.observe({
            changed: function(newDoc, oldDoc) {
                console.log("change", newDoc, newDoc.text);
                if (newDoc.cmd == "clipboad") {
                    cordova.plugins.clipboard.copy(newDoc.text);
                } else if (newDoc.cmd == "maps") {
                    cordova.InAppBrowser.open("geo:0,0?q=" + newDoc.text, '_system', 'location=yes');
                } else if (newDoc.cmd == "url") {
                    cordova.InAppBrowser.open(newDoc.text, '_system', 'location=yes');
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


Template.web.onRendered(function() {
    Clipboard.insert({ text: "type here" }, function(err, id) {
        Session.set('id', id);
        $('#qrcode').qrcode( { 
            text: id,
            render: 'canvas',
            width: 32,
            height: 32, 
            ecLevel: 'H',
            fill: "#000",
            background: "#ffffff",
            radius: 0.0,
        });
    });
});

Template.web.events({
    'keydown input': function(event, template) {
        if (event.keyCode == 13) {
            var val = template.$(event.target).val();
            Clipboard.update(Session.get('id'), {
                text: val,
                cmd: event.target.dataset.cmd
            });
        }
    }
});
