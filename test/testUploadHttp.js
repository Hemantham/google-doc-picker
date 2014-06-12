process.env.CONFIG = __dirname + '/config/config.js';

var googleUpload = require('./../lib/google-upload.js'),
    testCase = require('nodeunit').testCase,
    util = require('util'),
    fs = require('fs')
    http = require('http'),
    URL = require('url'),
    request = require('request'),
    app = require('./../app'),
    configToken = require('./config/token');

var self = this;

module.exports = testCase({
    setUp: function(callback) {
        configToken.getToken(function(error, token) {
            self.token = token;
            callback();
        })
    },
    tearDown: function(callback) {
        callback();
    },

    // ============================================================================    
    "test missingHeaders": function(test, token) {
    // ============================================================================    
        //test.expect(3);
        var file = fs.readFileSync(__dirname + "/smallTestFile.txt");
        app.listen(15901);

        var options= {
            method: 'PUT',
            uri: 'http://localhost:15901/api/upload',
            body: file,
            headers: {
                'x-authorization': self.token
            }
        }
        request(options, function(error, response, body) {
            test.equal(response.statusCode, 400);
            app.close();
            test.done();            
        });

    },

    // ============================================================================    
    "test multi-chunk upload": function(test, token) {
        // ============================================================================    
        //test.expect(3);
        var file = fs.readFileSync(__dirname + "/testLargeFile.pdf");
        app.listen(15902);

        var options= {
            method: 'PUT',
            uri: 'http://localhost:15902/api/upload',
            body: file,
            headers: {
                'x-file-name': "testLargeFile.pdf",
                'x-file-type': "application/pdf",
                'x-file-size': file.length,
                'x-authorization': self.token
            }
        };

        function sendRequest() {
            request(options, function(error, response, body) {
                if(error) util.error (error);
                test.ok(!error);
                test.equal(201, response.statusCode);
                app.close();
                test.done();
            });
            
        }

        sendRequest();
    },

    // ============================================================================    
    "negative test multi-chunk upload bad file length": function(test, token) {
        // ============================================================================    
        //test.expect(3);
        var file = fs.readFileSync(__dirname + "/testLargeFile.pdf");
        app.listen(15902);

        var options= {
            method: 'PUT',
            uri: 'http://localhost:15902/api/upload',
            body: file,
            headers: {
                'x-file-name': "testLargeFile.pdf",
                'x-file-type': "application/pdf",
                'x-file-size': file.length - 1,
                'x-authorization': self.token
            }
        };

        function sendRequest() {
            request(options, function(error, response, body) {
                test.ok(!error);
                test.equal(400, response.statusCode);
                app.close();
                test.done();
            });
            
        }

        sendRequest();
    },

//    // ============================================================================    
//    "test form upload": function(test, token) {
//        // ============================================================================    
//        //test.expect(3);
//        var file = fs.readFileSync(__dirname + "/testLargeFile.pdf");
//        app.listen(15902);
//
//        var options= {
//            method: 'POST',
//            uri: 'http://localhost:15902/api/uploadform?filename=' + __dirname + "/smallTestFile.txt" + '&token=' + token,
//            body: file,
//        };
//
//        function sendRequest() {
//            request(options, function(error, response, body) {
//                if(error) util.error (error);
//                test.ok(!error);
//                test.equal(201, response.statusCode);
//                app.close();
//                test.done();
//            });
//            
//        }
//
//        sendRequest();
//    }


});