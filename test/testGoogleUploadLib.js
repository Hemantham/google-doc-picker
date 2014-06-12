var googleUpload = require('./../lib/google-upload.js'),
    testCase = require('nodeunit').testCase,
    util = require('util'),
    fs = require('fs')
    http = require('http'),
    URL = require('url'),
    config = require('./testConfig');

var self = this;

googleUpload.init(config.GOOGLE_APPS_CLIENT_KEY, config.GOOGLE_APPS_CLIENT_SECRET);

module.exports = testCase({
    setUp: function(callback) {
        callback();
    },
    tearDown: function(callback) {
        callback();
    },

    // ============================================================================    
    "test smallUpload": function(test, token) {
        // ============================================================================    
        //test.expect(3);
        var file = fs.readFileSync(__dirname + "/smallTestFile.txt");

        var options = {
            email: config.GOOGLE_EMAIL,
            title: "smallTestFile.txt",
            type: "text/plain",
            size: file.length
        }

        googleUpload.createDoc( options, file, function(error, response, result ) {
            test.ok(!error)
            test.equal(response.statusCode, 201);
            test.done();
        });

    },

    // ============================================================================    
    "test largeUploadBinary": function(test, token) {
        // ============================================================================    
        //test.expect(3);
        var file = fs.readFileSync(__dirname + "/testLargeFile.pdf");

        var args = {
            email: config.GOOGLE_EMAIL,
            title: "testLargeFile.pdf",
            type: "application/pdf",
            size: file.length
        }

        googleUpload.createDoc( args, file, function(error, response, result ) {
            test.ok(!error)
            test.equal(response.statusCode, 201);
            test.done();
        });

    }


});