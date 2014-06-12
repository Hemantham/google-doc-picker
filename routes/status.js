var os = require('os');
var path = require('path');

module.exports = function(app)  {
   
    app.get('/status', function(req, res) {
        var packageInfo = require(path.join(process.cwd(), 'package'))

        res.send({
                name: packageInfo.name,
                version: packageInfo.version,
                buildMeta: packageInfo.buildMeta,
                nodeVersion: process.version.node,
                process: {
                    pid: process.pid,
                    memory: process.memoryUsage(),
                    uptime: process.uptime()
                },
                os: {
                    memory: os.freemem() + ' / ' + os.totalmem() + ' (free/total)',
                    uptime: os.uptime(),
                    hostname: os.hostname(),
                    cpus: os.cpus().length
                }               
            });

    });  

};