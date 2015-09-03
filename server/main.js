Meteor.startup(function () {
    // code to run on server at startup
});


Meteor.publish('clipboard', function(id) {
    if (id) {
        return Clipboard.find({_id: id});
    }
});
