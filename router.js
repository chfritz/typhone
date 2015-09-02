Router.configure({
  layoutTemplate: 'layout'
});

Router.map(function() {
  this.route('mobile', {
    path: '/'
  });

  // this.route('contacts.show', {
  //   path: '/contacts/:_id'
  // });
});
