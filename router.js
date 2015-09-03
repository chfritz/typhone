Router.route('/page/:id', function () {
    // console.log("on route", this.params.id);

    // add the subscription handle to our waitlist
    this.wait(Meteor.subscribe('clipboard', this.params.id));
    
    // this.ready() is true if all items in the wait list are ready
    if (this.ready()) {
        if (Meteor.isCordova) {
            this.layout('layout');
            this.render('mobile', {
                data: function() {
                    return Clipboard.findOne();
                }
            });
        } else {
            this.render('web');
        }
    }
});

Router.route('/', function () {
    if (Meteor.isCordova) {
        this.layout('layout');
        this.render('mobile');
    } else {
        this.render('web');
    }
});
