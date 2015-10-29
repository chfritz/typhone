Meteor.startup(function () {

    // clean up
    Clipboard.remove({});
    Signaling.remove({});

    Accounts.onLogin(function() {
        // create user collection if it doesn't yet exist
        console.log("creating new collection for user", Meteor.userId());
        if (!Clipboard.findOne({_id: Meteor.userId()})) {
            Clipboard.insert({_id: Meteor.userId()});
        }
    });
});


Meteor.publish('clipboard', function(id, device) {
    id = id || this.userId;
    if (id) {
        var connection = this.connection;

        console.log(id, "new connection", connection);
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

// WebRTC

Meteor.publish('signaling', function(channel, isCaller) {
    if (channel) {
        // var connection = this.connection;

        // whenever someone new connects, reset all the signaling data
        countId = Signaling.findOne({channel: channel, count: {$exists: 1}});
        if (countId) {
            Signaling.remove({channel: channel, count: {$exists: 0}});
            Signaling.update(countId, {$inc: {count: 1}});
        } else {
            Signaling.insert({channel: channel, count: 1});
        }


        this.onStop(function() {
            Signaling.update({channel: channel, count: {$exists: 1}},
                             {$inc: {count: -1}});
            if (Signaling.findOne({channel: channel, count: {$exists: 1}}).count == 0) {
                Signaling.remove({channel: channel});
            }
        });

        return Signaling.find({channel: channel});
    }
});
