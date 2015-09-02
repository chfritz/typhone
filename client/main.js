

Template.mobile.helpers({
    clipboard: function() {
        var c = Clipboard.findOne();
        if (c) {
            return c.text;
        }
    }
});

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
