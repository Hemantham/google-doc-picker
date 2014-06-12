var windmill = require('eclg-windmill'),
    defaultEmail = 'breveAdminiPad2@saml.testedu.info',
    windmillConfig = {
      rootUrl: 'http://whittaker-campus.dmz.arch.ecollege.com:3002',
      key: '1111111111222222',
      keyMoniker: 'assertion'
    },
    token = null;

windmill.init(windmillConfig);

module.exports.getToken = function(/* email, callback*/) {

  var email = (typeof arguments[0] === 'function') ? defaultEmail : arguments[0];
  var callback = (typeof arguments[0] !== 'function') ? arguments[1] : arguments[0];

  windmill.getAssertionToken (email, function(error,token){
    windmill.emptyTokenCache();
    callback (error, token);
  });

}