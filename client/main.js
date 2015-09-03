

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
                cordova.plugins.clipboard.copy(newDoc.text);
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
            width: 64,
            height: 64, 
            ecLevel: 'H',
            fill: "#000",
            background: "#ffffff",
            radius: 0.0,
        });
    });
});

Template.web.events({
    'click button': function(event, template) {
        var val = template.$('textarea').val();
        console.log(val);
        Clipboard.update(Session.get('id'), {text: val});
    }
});
