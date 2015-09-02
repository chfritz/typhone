
// if (Meteor.isCordova) {    
//     cordova.plugins.clipboard.copy("text from meteor");
// }

// counter starts at 0
Session.setDefault('counter', 0);

Template.hello.helpers({
    counter: function () {
        return Session.get('counter');
    },
    debug: function() {
        console.log(cordova.plugins.clipboard);
        cordova.plugins.clipboard.copy("text from meteor2");
    }
});

Template.hello.events({
    'click button': function () {
        // increment the counter when button is clicked
        Session.set('counter', Session.get('counter') + 1);
    }
});

