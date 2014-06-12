var cluster         = require('cluster')
  , spawn           = require('child_process').spawn
  , fs              = require('fs')
  , semver          = require('semver')
  , request         = require('request')
  , path            = require('path')
  , PORT            = parseInt(process.argv[2] || 8200)
  , config_location = process.env.CONFIG
  , config          = require(config_location || './config.js');

// verify that the version of node specified in the package.json is valid
var package_json = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"))+"");
if (!semver.satisfies(process.version, package_json.engines.node)) {
    console.log("WARNING! NOT running the node.js version specified in the package.json!\n" 
        + "**** '" + process.version + "' not compatable with '" + package_json.engines.node + "' ****");
}


try {
  fs.mkdirSync('/tmp/docpicker', 0777);  
} catch(error) {}


cluster('app.js')
    .set('workers', config.WORKERS || 2)
    .set('socket path', '/tmp/docpicker')
    .use(cluster.logger(config.LOGGING_DIRECTORY))
    .use(cluster.stats({ connections: true, requests: true }))
    .use(cluster.repl(config.REPL_PORT || 8201))
    .listen(PORT);
