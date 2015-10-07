Meteor.startup(function () {
    // code to run on server at startup

    Accounts.onLogin(function() {
        // create collection if it doesn't yet exist
        console.log("creating new collection for user", Meteor.userId());
        Clipboard.upsert({_id: Meteor.userId()}, {});
    });
});


Meteor.publish('clipboard', function(id, device) {
    if (id) {
        var connection = this.connection;

        console.log("new connection", connection);
        if (device) {
            connection.device = device;
        }
        Clipboard.update(id, {
            $push: {connections: connection}
        });

        this.onStop(function() {
            console.log("connection closed:", connection);
            Clipboard.update(id, {
                $pull: { connections: {id: connection.id}}
            });
        });
        
        return Clipboard.find({_id: id});
    }
});

Meteor.publish('signaling', function(channel) {
    if (channel) {
        return Signaling.find({channel: channel});
    }
});
