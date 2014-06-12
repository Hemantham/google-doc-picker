var util = require('util'),
  https = require('https'),
  http = require('http'),
  fs = require('fs'),
  querystring = require('querystring'),
  url = require('url'),
  semver = require('semver'),
  path = require('path'),
  express = require('express'),
  gzip = require('connect-gzip'),
  _ = require('underscore'),
  eventMiddleware = require('./lib/middleware/event'),
  cb = require('./lib/callback.js'),
  // , config_location = process.env.CONFIG
  // , config          = require(config_location || './config.js')
  scribe = require('scribe'),
  google = require('eclg-google-service-client'),
  whittaker = require('eclg-whittaker'),
  dojonpm = require('eclg-dojo'),
  googleUpload = require('./lib/google-upload'),
  cluster = require('cluster'),
  googleOAuth = require('eclg-google-oauth').googleOauth,
  middleware = require('eclg-node-middleware'),
  nconf = require("nconf");
//  NUM_WORKERS = nconf.get("WORKERS") || 1;
//  PORT = parseInt(nconf.get('PORT'));


//load confog based on environment.

var NODE_ENV = process.env.NODE_ENV || 'local';
console.log('debug1', 'ENV: ' + NODE_ENV);

var __dirname = __dirname || '';

var envConfigFile = __dirname + '/config/' + NODE_ENV + '.json';

console.log(envConfigFile);
nconf.argv();

try {
  console.log(JSON.parse(fs.readFileSync(envConfigFile, 'utf-8')).GOOGLE_OAUTH1_CLIENT_KEY);

  nconf.defaults(JSON.parse(fs.readFileSync(envConfigFile, 'utf-8')));
} catch (ex) {
  console.log('warning', 'environment config file not found: ' + envConfigFile);
}

nconf.file({
  file: __dirname + '/config/config.json'
});

// moved the config.gets here because nconf will only finish
// setting it's configs on the previous lines
var PORT = parseInt(nconf.get('PORT'));
var NUM_WORKERS = nconf.get("WORKERS") || 1;




//----------------------------------------------------------------------------
//Config Validation
//----------------------------------------------------------------------------
if (!nconf.get("GOOGLE_OAUTH1_CLIENT_KEY")) throw ("FATAL: nconf.GOOGLE_OAUTH1_CLIENT_KEY not defined");
if (!nconf.get("GOOGLE_OAUTH1_CLIENT_SECRET")) throw ("FATAL: nconf.GOOGLE_OAUTH1_CLIENT_SECRET not defined");
if (!nconf.get("GOOGLE_OAUTH2_CLIENT_KEY")) throw ("FATAL: nconf.GOOGLE_OAUTH2_CLIENT_KEY not defined");
if (!nconf.get("GOOGLE_OAUTH2_CLIENT_SECRET")) throw ("FATAL: nconf.GOOGLE_OAUTH2_CLIENT_SECRET not defined");
if (!nconf.get("WHITTAKER_ROOT_URL")) throw ("FATAL: nconf.WHITTAKER_ROOT_URL not defined");

//----------------------------------------------------------------------------
//Google Consumer Authorization Definitions
//----------------------------------------------------------------------------
if (!nconf.get("CHAMBER_ROOT_URL")) throw ("FATAL: nconf.CHAMBER_ROOT_URL not defined");
if (!nconf.get("GOOGLE_ROOT_REFRESH_URL")) throw ("FATAL: nconf.GOOGLE_ROOT_REFRESH_URL not defined");

// ============================================================================
// Express app configuration
// ============================================================================

var app = module.exports = express.createServer();

app.enable("jsonp callback");

// in production mode use gzip compression
// note: this litters the directorys with *.gz files
app.configure('production', function() {
  app.use(gzip.gzip());
});

app.configure(function() {
  app.use(eventMiddleware.bufferUploadEvents());
  app.use(middleware.cors.allow({
    urlPrefix: '/api'
  }));
  app.use(express.bodyParser());
  app.use(middleware.jsonp.isJsonp());
  app.use(middleware.jsonp.bodyParser());
  app.use(middleware.jsonp.methodOverride('_method'));
  app.use(app.router);
  app.use(dojonpm.static("1.6.1"));
  app.use(express.static(__dirname + "/public"));
});

require('./routes')(app);

// ============================================================================
// Initialization
// ============================================================================

var googleOauthObj = {
  chamberRootUrl: nconf.get("CHAMBER_ROOT_URL"),
  googleRootRefreshUrl: nconf.get("GOOGLE_ROOT_REFRESH_URL"),
  rootUrl: nconf.get("WHITTAKER_ROOT_URL"),
  oauth1ClientId: nconf.get("GOOGLE_OAUTH1_CLIENT_KEY"),
  oauth1ClientSecret: nconf.get("GOOGLE_OAUTH1_CLIENT_SECRET"),
  oauth2ClientId: nconf.get("GOOGLE_OAUTH2_CLIENT_KEY"),
  oauth2ClientSecret: nconf.get("GOOGLE_OAUTH2_CLIENT_SECRET")
}
googleOAuth.init(googleOauthObj);
middleware.consumer.init(googleOauthObj);
google.init(googleOAuth);
googleUpload.init(googleOAuth);
whittaker.init({
  rootUrl: nconf.get("WHITTAKER_ROOT_URL")
});
middleware.whittaker.init({
  rootUrl: nconf.get("WHITTAKER_ROOT_URL")
});

// catch uncaught exceptions
//process.addListener("uncaughtException", function (err) {
//    console.log("Uncaught exception: " + err);
//    console.trace();
//});

// set the max outbound connection sockets  for google and whittaker

function setMaxSockets(url_root) {
  var parsed = url.parse(url_root);
  if (parsed.protocol == 'http')
    http.getAgent(parsed.host).maxSockets = 100;
  else if (parsed.protocol == 'https')
    https.getAgent({
      host: parsed.host
    }).maxSockets = 100;
}

setMaxSockets(nconf.get("WHITTAKER_ROOT_URL"));
setMaxSockets("https://docs.google.com");

// ============================================================================
// Routes
// ============================================================================

// app.get('/foo', middleware.whittaker.authenticated(), function(req, res, next) {
//   var error, response, result
//   resultCallback(error, response, result);
// });

/**
 * Route: Upload file to Google Docs
 *
 * Secured by Google Docs API
 */

app.put('/api/upload', middleware.consumer.whoMe(), ifAuthorized, function(req, res, next) {

  var resultCallback = cb.resultCallback(req, res),
    userEmail = req.me.email,
    missingHeaders = _.filter(['x-file-name', 'x-file-type', 'x-file-size'], function(v) {
      return !req.headers[v];
    }),
    uploaded = 0,
    upload = 0,
    size = 0,
    args;

  // validate the minimum request headers exist on the request
  if (missingHeaders.length != 0)
    return resultCallback(missingHeaders.join(", ") + " HTTP request header(s) is required but missing", {
      statusCode: "400"
    });
  else {

    try {
      size = Number(req.headers['x-file-size']);
    } catch (error) {
      resultCallback("header x-file-size is invalid", {
        statusCode: "400"
      });
    }

    console.log('Uploading...');
    args = {
      googleUserType: req.me.googleUserType,
      token: req.query.token,
      email: userEmail,
      title: req.headers['x-file-name'],
      type: req.headers['x-file-type'],
      size: size
    }
    console.log(args);

    // Now that we've validated the headers, pass the req object through to the 
    // streamDoc function. 
    // The req argument is expected to be an EventEmitter that emits these events:
    //
    // * 'data' - req.on('data', function() {})
    // * 'end' - req.on('end', function() {})
    // 
    // The streamDoc function wil not handle the reqponse though

    googleUpload.streamDoc(args, req, function(error, result, response) {

      if (error) {
        console.log("ERROR!!!");
        resultCallback(error, {
          statusCode: "400"
        }, {
          file: args.title,
          size: args.size,
          durationms: result.durationms
        });
      } else {
        console.log("SUCCESS!!!");
        var result = {
          file: args.title,
          size: args.size,
          result: result.fileData,
          durationms: result.durationms
        };
        resultCallback(false, {
          statusCode: "201",
          url: response.data
        }, result);
        console.log(result);
      }

    });
  }
});


/*
 * This handles form upload
 */
app.post('/api/upload', middleware.consumer.whoMe(), ifAuthorized, function(req, res) {
  var resultCallback = cb.resultCallback(req, res),
    userEmail = req.me.email,
    args = {
      googleUserType: req.me.googleUserType,
      token: req.query.token,
      email: userEmail
    };

  console.log(args);

  googleUpload.formCreateDoc(args, req, function(error, response, result) {
    req.iframe = true;
    if (error) {
      console.log("ERROR!!!");
      var resultString = "<textarea>400</textarea>";
      resultCallback(false, {
        statusCode: "400",
        url: response.data
      }, resultString);
    } else {
      console.log("SUCCESS!!!");
      console.log(response.data);
      var resultString = '<textarea>' + response.data + '</textarea>';
      resultCallback(false, {
        statusCode: "201"
      }, resultString);
      console.log(resultString);
    }
  });
});
/**
 * Route: Delete doc from Google Docs
 *
 * Secured by Google Docs API
 */

app.post('/api/delete', middleware.consumer.whoMe(), ifAuthorized, function(req, res, next) {
  var resultCallback = cb.resultCallback(req, res),
    userEmail = req.me.email,
    file = req.body.file;

  args = {
    googleUserType: req.me.googleUserType,
    token: req.query.token,
    email: userEmail,
    file: file
  }
  console.log(args);

  googleUpload.deleteDoc(args, function(error, result, response) {
    if (error) {
      resultCallback(error, {
        statusCode: "400"
      }, {
        response: error
      });
    } else {
      resultCallback(false, {
        statusCode: "200"
      }, {
        fileDeleted: file
      });
    }
  });
});

/**
 * Route: Get docs from Google Docs
 *
 * Secured by Google Docs API
 */
app.get('/api/docs', middleware.consumer.whoMe(), ifAuthorized, function(req, res, next) {
  var resultCallback = cb.resultCallback(req, res),
    userEmail = req.me.email,
    searchDoc = req.query.search == 'null' ? '' : req.query.search;

  var dataObj = {
    googleUserType: req.me.googleUserType,
    token: req.token,
    email: userEmail,
    query: searchDoc,
    max: 1000
  };

  google.docs.search(dataObj, function(error, response, result) {
    if (error) {
      var statusCode = !response ? 500 : (response.statusCode || 400)
      resultCallback(error, {
        statusCode: statusCode
      }, {
        response: error
      });
    } else {
      resultCallback(false, {
        statusCode: response.statusCode
      }, result);
    }
  });
});


function ifAuthorized(req, res, callback) {
  if (!req.authenticated) {
    var resultCallback = cb.resultCallback(req, res)
    return resultCallback('authorization failed', {
      statusCode: 401
    }, null);
  } else callback();
}

// if no PORT has been configurated then we're probably running in a test
// or someone else plans to call listen on me
if (!PORT) {
  util.log("NOT AUTOMATICALLY STARTING APP to LISTEN, running a test?");
}

// Otherwise, if there's just one worker, don't use cluster
else if (NUM_WORKERS === 1) {
  util.log("not using cluster, starting just one process on " + PORT);
  app.listen(PORT, registerToPortAuthority);
}

// Use cluster to start app
else {

  // Start the app using the cluster API
  if (cluster.isMaster) {
    util.log("starting MASTER on " + PORT + ", starting " + NUM_WORKERS + " workers");

    // Fork workers.
    for (var i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }

    cluster.on('death', function(worker) {
      console.log('worker ' + worker.pid + ' died');
      cluster.fork();
    });
  } else {
    util.log("starting WORKER " + process.env.NODE_WORKER_ID);
    app.listen(PORT, registerToPortAuthority);
  }
}


function registerToPortAuthority() {

  // this should be included only when needed, and not for the entire module. The server MASTER process should stay as clean as possible to ensure it stays running and continues to monitor workers correctly.
  var harbor = require('spindrift-harbor');

  var ROLE = JSON.parse(fs.readFileSync('./package.json', 'utf8')).name + '@' + JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

  var USE_PORT_AUTHORITY = process.env.USE_PORT_AUTHORITY || (nconf.get('USE_PORT_AUTHORITY') === 'true' || nconf.get('USE_PORT_AUTHORITY') === true);
  var PORT_AUTHORITY_HOST = process.env.PORT_AUTHORITY_HOST || nconf.get('PORT_AUTHORITY_HOST');
  var PORT_AUTHORITY_PORT = parseInt(process.env.PORT_AUTHORITY_PORT || nconf.get('PORT_AUTHORITY_PORT'));

  var SIGTERM_TIME_BUFFER = 500;

  scribe.log("info", "USE_PORT_AUTHORITY " + USE_PORT_AUTHORITY);
  if (USE_PORT_AUTHORITY) {
    console.log(PORT_AUTHORITY_HOST, PORT_AUTHORITY_PORT, ROLE, PORT)
    harbor.init({
      portAuthorityHost: PORT_AUTHORITY_HOST,
      portAuthorityPort: PORT_AUTHORITY_PORT,
      docks: [{
        role: ROLE,
        port: PORT
      }]
    });

    process.on('SIGTERM', function() {
      harbor.undock();

      scribe.log('info', 'received SIGTERM, unregistering from Port Authority and process will terminate in ' + SIGTERM_TIME_BUFFER + 'ms...')

      setTimeout(function() {
        process.exit(0)
      }, SIGTERM_TIME_BUFFER)

    });

  }
}