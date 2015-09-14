Meteor.startup(function () {
    // code to run on server at startup
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

