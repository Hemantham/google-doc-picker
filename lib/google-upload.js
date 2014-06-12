var https          = require('https')
  , fs              = require('fs')
  , google          = require('eclg-google-service-client')
  , hbs             = require('eclg-google-service-client/node_modules/hbs')
  , URL             = require('url')
  , request         = require('request')
  , assert          = require('assert')
  , _               = require('underscore')

  , ADD_DOC_TO_COLLECTION_URL = "https://docs.google.com/feeds/default/private/full/{{collectionId}}/contents?v=3&alt=json&xoauth_requestor_id={{email}}"
  , GOOGLE_DOCS_FEED_URL = "https://docs.google.com/feeds/default/private/full?{{search}}max-results=1000&v=3&alt=json&xoauth_requestor_id={{email}}"
  , CREATE_RESUMABLE_URL = "https://docs.google.com/feeds/upload/create-session/default/private/full?{{convert}}v=3&alt=json&xoauth_requestor_id={{email}}"
  , CHUNKSIZE = 524288
  , MAXCONVERT = 2097152
  , createDocTemplate = fs.readFileSync( __dirname + '/templates/createDocTemplate.xml', 'utf8' ) 
//  , createDocTemplate = hbs.handlebars.compile( fs.readFileSync(__dirname + '/templates/createDocTemplate.xml', 'ascii') )
  , googleUpload = {}
  , self = module.exports = googleUpload;


self.googleOAuth = null;
  
self.init = function(oAuth) {
    self.googleOAuth = oAuth;
};

/**
 * Stream a new file to Google Docs by efficiently passing request
 * data chunks through to Google as they arrive, only buffering in
 * memory that which hasn't been pushed out to Google yet
 * 
 *      // Example options object:
 *      {
 *          email: <email address of user> ,
 *          title: <file name>,
 *          type: <file mime type.,
 *          size: <file size>
 *      }
 *
 * @param args {Object} options
 * @param request {object} a HTTP or HTTPS request object or more specifically an EventEmitter that emits 'data' and 'end'
 * @param callback {function} function(error, result, response ){}
 */
self.streamDoc = function( options, request, callback ) {
    var startTime = Date.now()
    // this is where we'll store incoming chunks before they get sent out to Google
      , bufferedData = []
    // track how much data we've set up the wire to Google
      , sentDataSize = 0
    // track how much data has been sent to us by the client
      , accumDataSize = 0
    // handle to the data that's currently being sent to Google
      , chunksInFlight = []
    // handle to the data that's waiting to be sent and is next in line
      , chunksOnDeck = []
    // flag to track if we've received all the data we expected from the client
      , allChunksReceived = false
    // If there's an error and the callback is already handled, that's a sign we should clean up
      , errored = false
    // the upload URL for resumable upload to Google
      , uploadUrl = null;

    request.eventbuffer.ondata( function(data) {
        var bufferedDataSize = 0
          , accumLookAheadSize = 0
          , chunksToProcess = []
          , lastChunk, lastChunkBoundary, putbackChunk;

        // if we've already errored, assume things have been cleaned up already and stop execution
        if(errored) return; 

        bufferedData.push(data);
        accumDataSize += data.length;
        console.log( String( roundNumber( ( ( accumDataSize) / options.size ) * 100, 2 ) ) + "%\t- " + accumDataSize + " Bytes" );

        if(accumDataSize === options.size) {
            allChunksReceived = true;
        }
            
        bufferedDataSize = totalLength(bufferedData);
        
        // Do we have enought data to fill a chunk to send to Google (CHUNKSIZE) ?
        if(bufferedDataSize > CHUNKSIZE) {
            // loop through grabbing chunks to process until we have enought to 
            // fill out CHUNKSIZE
            while(accumLookAheadSize < CHUNKSIZE) {
                accumLookAheadSize += bufferedData[0].length
                chunksToProcess.push(bufferedData.shift());
            }

            // look at the last chunk and find the point in the middle where
            // we need to split it based on the total outbound chunk with CHUNKSIZE 
            // we're building. Put back the remainder of the last chunk onto the bufferedData array
            lastChunk = chunksToProcess[chunksToProcess.length-1];
            lastChunkBoundary = CHUNKSIZE - (accumLookAheadSize - lastChunk.length);
            putbackChunk = lastChunk.slice(lastChunkBoundary);
            bufferedData.unshift(putbackChunk);
            chunksToProcess[chunksToProcess.length-1] = lastChunk.slice(0, lastChunkBoundary);

            //console.log("READY TO SEND " + chunksToProcess.length + " chunks, " + bufferedData.length + " chunks remaining with size of " + bufferedDataSize);
            // we should have just grabed a CHUNKSIZE of data from the bufferedData array
            assert.equal( totalLength(bufferedData), bufferedDataSize - CHUNKSIZE );


            // if there is a request currently in flight to Google OR we don't have the 
            // upload URL (the initial request hasn't finished yet), put these chunks
            // on deck 
            if(chunksInFlight.length > 0 || uploadUrl === null) {
                // if not chunks are in flight then we shouldn't have any on deck either
                assert.equal(0, chunksOnDeck.length);

                // move the chunks we just gathered in chunksToProcess to on deck
                chunksOnDeck = chunksToProcess;

                // with one batch of chunks on deck, let's pause chunks coming in as a throttle
                request.pause();            
            }
            else {
                // no chunks are in flight, so we are free to take off
                sendNextChunk(chunksToProcess);
            }

        }

    });

    request.eventbuffer.onend( function() {
        // The request has finished so we should have received all of the data
        // the client said it was going to pass. If not then we need to fail
        if(!allChunksReceived) {
            console.log("We did not receive all of the data expected!");
            return errorAndCleanUp("Upload unexpectedly ended, bad request", { statusCode: 400 });
        }
        assert.ok(allChunksReceived);
    });
               
    self._initUpload( options, function( error, data, response ) {
        if(errored) return; 
        if(error) return errorAndCleanUp(error, response);

        uploadUrl = data.uploadUrl;

        // if there are chunks waiting on deck, let them take off
        if(chunksOnDeck.length > 0) {
            console.log("THERE ARE CHUNKS ON DECK")
            sendNextChunk(chunksOnDeck);
            chunksOnDeck = [];
            request.resume();
        }
        else if(allChunksReceived) {
            sendNextChunk(bufferedData);
            bufferedData = [];
        }
    });


    //
    // Define this function inline so we can retain the wrapped scope
    //
    function sendNextChunk(chunksToProcess) {
        if(errored) return; 

        // on the runway taking off, set this payload to inflight
        chunksInFlight = chunksToProcess;

        assert.ok(uploadUrl !== null);

        var args = {
            uploadUrl: uploadUrl,
            offset: sentDataSize,
            size: options.size,
            type: options.type              
        };

        // FIRE!
        self._sendChunk(chunksInFlight, args, function(error, data, response) {
            if(errored) return; 
            if(error) return errorAndCleanUp(error, response);

            // gobble up the payload size, we just landed
            // cleanup
            sentDataSize += totalLength(chunksInFlight);
            delete chunksInFlight;
            chunksInFlight = [];

            // the runway is open, if we have chunks on deck, send them
            // in case the request was paused, resume it because on deck is clear
            if(chunksOnDeck.length > 0) {
                sendNextChunk(chunksOnDeck);
                chunksOnDeck = [];
                request.resume();
            }

            // we're at the end of the road, all chunks have been uploaded to
            // us, but we didn't have enought for a full chunk to send to Google
            // so send the rest
            else if(allChunksReceived && bufferedData.length > 0) {
                sendNextChunk(bufferedData);
                bufferedData = [];
            }

            else if(sentDataSize == options.size) {
                assert.ok(allChunksReceived);
                assert.equal(0, chunksOnDeck.length, "chunksOnDeck should be empty");

                // This is the end of the road. SUCCESS!
                data.durationms = Date.now() - startTime;
                callback(false, data, response);
            }
            else {
                assert.ok(sentDataSize < options.size, "sentDataSize unexpectantly greater than total size of upload")
            }
        });
        
    }

    function errorAndCleanUp(error, response) {
        // in case the request was paused but never resumed
        request.resume();
        if(bufferedData) bufferedData.forEach(function(i) { delete i });
        if(chunksInFlight) chunksInFlight.forEach(function(i) { delete i });
        if(chunksOnDeck) chunksOnDeck.forEach(function(i) { delete i });
        errored = true;
        console.log(error, " errorAndCleanup")
        callback(error, { durationms: Date.now() - startTime }, response || { statusCode: 400 });
    }

}

/**
 * Stream a new file to Google Docs with the entire file passed as
 * an in memory buffer
 * 
 *      // Example options object:
 *      {
 *          email: <email address of user> ,
 *          title: <file name>,
 *          type: <file mime type.,
 *          size: <file size>
 *      }
 *
 * @param args {Object} options
 * @param uploadData {Buffer} entire file contents buffered
 * @param callback {function} function(error, response, result ){}
 *
 */
self.createDoc = function( options, uploadData, callback ) {
    
    var startTime = new Date().getTime();
               
    self._initUpload( options, function( error, data, response ) {
        if ( error ) return callback( error, response, null );
        
        var putArgs = {
            method: "PUT",
            feedUrl: response.headers.location,
            type: options.type,
            body: uploadData,
            size: options.size,
            offset: 0,
            count: 0
        };

        self._sendChunks( putArgs, function( error, data, response ) {
            if ( error ) {
                callback( error, { statusCode: error.statusCode }, null );
            }
            else{
                if( data.data && data.statusCode == "201"){
                    var parsed = JSON.parse( data.data )
//                      , success = self._parseAlternateLink( parsed.entry.link );
                    callback( null, { statusCode: data.statusCode, data: response.headers.location }, response );
                }
            }
        });

    });
}

self.formCreateDoc = function( options, request, callback ){
    var userEmail = options.email
      , body = ''
      , header = ''
      , EOH = '\r\n\r\n' //end of header
      , content_type = request.headers['content-type']
      , boundary = content_type.split(' ')[1].split('=')[1]
      , headerFlag = true
      , filename = '';
      
      request.eventbuffer.ondata( function( data ) {
          
          filename = request.query.filename || 'testfile.txt';
          var i = 0;
          while (i < data.length) {
              if (headerFlag) {
                  var chars = data.slice(i, i+4).toString();
                  if (chars === EOH) {
                      i = i + 4;
                      headerFlag = false;
                  }
                  else {
                      i += 1;
                  }
              }
              else {
                  body += data.toString('binary', i, data.length);
                  i = data.length;
              }
          }
      });
    
      request.eventbuffer.onend( function() {
          
          body = body.slice(0, body.length - (boundary.length + 8))
          var args = {
              email: userEmail,
              title: filename,
              type: self._getMIMEtype( filename ) || 'application/octet-stream',
              size: body.length
          }
          
          var buf = new Buffer( body, 'binary' )
          var startTime = new Date().getTime();
          self._initUpload( args, function( error, data, response ) {
              if ( error ) return callback( error, response, null );
              var putArgs = {
                  method: "PUT",
                  feedUrl: response.headers.location,
                  type: args.type,
                  body: buf,
                  size: args.size,
                  offset: 0,
                  count: 0
              };

              self._sendChunks( putArgs, function( error, data, response ) {
                  if ( error ) {
                      callback( error, { statusCode: error.statusCode }, null );
                  }
                  else {
                      if( data.data && data.statusCode == "201"){
                          //console.log( data );
                          try {
                               var parsed = JSON.parse( data.data );
                              // for iframe textarea
                              fileData = parsed.entry.gd$resourceId.$t + ',' +
                                  self._parseAlternateLink( parsed.entry.link ) + ',' +
                                  response.headers.location + ',' +
                                  parsed.entry.title.$t + ',' +
                                  parsed.entry.published.$t + ',' +
                                  parsed.entry.updated.$t + ',' +
                                  parsed.entry.content.type;
                          
                          
                          } catch (e) {
                              fileData = '#' + ',' +
                                  '#' + ',' +
                                  '#' + ',' +
                                  filename + ',' +
                                  'error' + ',' +
                                  'error' + ',' +
                                  'error';
                          }
                          callback( null, { statusCode: data.statusCode, data: fileData }, response );
                      }
                  }
              });
          });
      });  
}

self._initUpload = function( options, callback ) {
    
    var docType = self._getDoctype( options.title );
    var feedUrl = self._getFeedUrl( CREATE_RESUMABLE_URL, {
            email: options.email,
            convert: ( ( Number( options.size ) > MAXCONVERT ) || ( docType === 'noconvert' )) ? "convert=false&" : ""
        });
    
    var sendRequest = function( authorization ) {
        var postBody = createDocTemplate
              .replace( '{{title}}', toHex( options.title ) )
              .replace( '{{invite}}', 'true' )
              .replace( '{{doctype}}', docType );
        var urlParts = URL.parse( feedUrl );
        var postOptions = {
                host: urlParts.host,
                path: urlParts.pathname + urlParts.search,
                method: "POST",
                headers: { 
                    "Host": urlParts.host,
                    "GData-Version": "3.0",
                    "Authorization": authorization,
                    "Content-Length": postBody.length,
                    "Content-Type": "application/atom+xml", 
                    "X-Upload-Content-Type": options.type,
                    "X-Upload-Content-Length": options.size
                }
            };
        var req = https.request( postOptions );
    
        req.addListener( 'response', function ( response ) {
            response.setEncoding( 'utf8' );
            
            if( response.statusCode == '200' )
                return callback( null, { uploadUrl: response.headers.location }, response );
            
            if( response.statusCode == '400' )
                return callback("Bad Request", {}, response );
            
            response.on( 'data', function( data ) {
                //callback( null, { statusCode: response.statusCode, data: data }, response );
            });
            
            response.on('error', function(data) {
                //callback( { statusCode: uploadRes.statusCode, data: data }, null, response );
            });
                    
        });
            
        req.write( postBody );
        req.end();
    };

    if( options.googleUserType === 'user' ){
        console.log( "using oauth 2.0 for initUpload ");
        var authObj = { whit_token: options.token };
        self.googleOAuth.oauth2GetAccessToken(authObj, function(error, data, response){
            if( error ) {
                console.log( error );
                return callback(error, {}, data );
            }
            sendRequest( data.Authorization ); 
        });
    }
    else{
        console.log( "using oauth 1.0 for initUpload ");
        var auth1Obj = { 
            url: feedUrl, 
            client_id: self.googleOAuth.config.oauth1ClientId, 
            client_secret: self.googleOAuth.config.oauth1ClientSecret, 
            method: 'POST'
        };
        self.googleOAuth.oauth1GetAuthHeader(auth1Obj, function(error, data, response){           
            if( error ) {
                console.log( error );
                return callback(error, {}, data );
            }
            sendRequest( data );  
        });
    } 
    
    function toHex( string ) {
      var ret = '';
      for ( i=0; i<string.length; i++ ) {
        ret += '&#x' + string.charCodeAt( i ).toString( 16 ).toUpperCase() + ';'; 
      }
      return ret;
    };
}

self._sendChunks = function( args, callback ) {
    var chunkData = new Buffer( CHUNKSIZE )
      , from = ( args.count * CHUNKSIZE )
      , to = ( ( args.count + 1 ) * CHUNKSIZE ) - 1
      , responseData = ''
      , resendCount = 0
      , options, req;

    if( to >= args.size ){ 
        to = args.size - 1; 
    }
    
    var length = to - from + 1
      , currentRange = from + "-" + to
      , urlParts = URL.parse( args.feedUrl );
    
    args.body.copy( chunkData, 0, from, to + 1 );
    
    options = {
        host: urlParts.host,
        path: urlParts.pathname + urlParts.search,
        method: args.method,
        headers: { 
            "Host": urlParts.host,
            "Content-Length": length,
            "Content-Type": args.type,
            "Content-Range": "bytes " + currentRange + "/" + args.size
        }
    };

    
    req = https.request( options );
    
    req.addListener( 'response', function ( response ) {
        response.setEncoding( 'utf8' );
        
        var bytesSuccessful = ( response.headers.range === ( "bytes=0-" + String( to ) ) ) ? true : false;

        if( response.statusCode == '201' ){
            //callback( null, { statusCode: response.statusCode, data: null }, response );
        }
        
        if( response.statusCode == '308' && bytesSuccessful ){
            var recurArgs = {
                method: "PUT",
                feedUrl: args.feedUrl,
                type: args.type,
                body: args.body,
                size: args.size,
                offset: to + 1,
                count: args.count + 1
            }
            self._sendChunks( recurArgs, callback );            
        }
        else if ( response.statusCode == '503' ) {
            //re-send failed chunk;
            if( resendCount > 3 ) return callback( { statusCode: response.statusCode, data: "resend exceeded" }, null, response );        
            
            self._sendChunks( recurArgs, callback );
            resendCount++;
        }
        
        if( response.statusCode == '400' ){
            callback( { statusCode: response.statusCode, data: null }, null, response );
        }
        
        response.on( 'data', function( data ) {
                responseData += data;
        });
        
        response.on('error', function( data ) {
            callback( { statusCode: uploadRes.statusCode, data: data }, data, response );
        });
        
        response.on( 'end', function( data ) {
            //console.log( response.headers.location );
            callback( null, { statusCode: response.statusCode, data: responseData }, response );
        });
                
    });
        
    req.write( chunkData );
    req.end();

    return;
}

/**
 *
 *      args: {
 *          uploadUrl:,
 *          offset:,
 *          size,
 *          type, <mime type>   
 *      }
 */
self._sendChunk = function(buffers, args, callback) {
    //console.log(args)
    var urlParts = URL.parse( args.uploadUrl )
      , length = totalLength(buffers)
      , from = args.offset
      , to = from + length -1
      , responseData = ''
      , resendCount = 0
      , options, req;
    
    options = {
        host: urlParts.host,
        path: urlParts.pathname + urlParts.search,
        method: "PUT",
        headers: { 
            "Host": urlParts.host,
            "Content-Length": length,
            "Content-Type": args.type,
            "Content-Range": "bytes " + from + "-" + to + "/" + args.size
        }
    };

    //console.log( options );
    
    req = https.request( options );

    req.addListener( 'response', function ( response ) {
        response.setEncoding( 'utf8' );

        var bytesSuccessful = ( response.headers.range === ( "bytes=0-" + String( to ) ) ) ? true : false;

        console.log(response.statusCode, bytesSuccessful, response.headers.range);

        if( response.statusCode == '201' ){
            //return callback( false, { fileLocation: response.headers.location}, response );
        }
        
        else if( response.statusCode == '308' && bytesSuccessful ){
            return callback(false, {}, response);
        }

        else if ( response.statusCode == '503' ) {
            //re-send failed chunk;
            if( args.resendCount > 3 ) return callback("Upload failed, resend count exceeded", { statusCode: response.statusCode, data: "resend exceeded" }, response );        
            
            args.resendCount = (args.resendCount || 0) + 1;
            self._sendChunk( buffers, args, callback );
        }
        
        else if( response.statusCode == '400' ){
            return callback("Bad Request", { statusCode: response.statusCode, data: null }, response );
        }
        
        response.on( 'data', function( data ) {
            responseData += data;
        });
        
        response.on('error', function( data ) {
            callback(data, {}, response );
        });
        
        response.on( 'end', function( data ) {
            var parsed = JSON.parse( responseData );
            //data for the data store
            fileData = {
                id: parsed.entry.gd$resourceId.$t,
                src: self._parseAlternateLink( parsed.entry.link ),
                location: response.headers.location,
                title: parsed.entry.title.$t,
                published: parsed.entry.published.$t,
                updated: parsed.entry.updated.$t,
                type: parsed.entry.content.type
            }
            
            return callback( false, { fileData: fileData }, response );
        });
                
    });
        
    buffers.forEach(function(buffer) {
        req.write( buffer );        
    });

    req.end();


    // setTimeout(function() {
    //     callback();
    // }, 100);
}

self.deleteDoc= function( args, callback ) {
    var sendRequest = function( authorization ) {
      var urlParts = URL.parse( args.file );
      var options = {
              host: urlParts.host,
              path: urlParts.pathname + urlParts.search,
              method: "DELETE",
              headers: { 
                  "Host": urlParts.host,
                  "GData-Version": "3.0",
                  "Authorization": authorization,
                  "If-Match": '*'
              }
          };
      var req = https.request( options );
      
      req.addListener( 'response', function ( response ) {
            response.setEncoding( 'utf8' );
            
            console.log( response.statusCode );
            //console.log( response );
            
            if( response.statusCode == '200' ){
                callback( null, { statusCode: response.statusCode, data: "delete successful" }, response );
            }
            else {
                callback( { statusCode: response.statusCode, data: "delete failed" }, null, response );
            }
            
            response.on( 'data', function( data ) {
                //callback( null, { statusCode: response.statusCode, data: data }, response );
                console.log( data );
            });
            
            response.on('error', function(data) {
                callback( { statusCode: uploadRes.statusCode, data: data }, null, response );
            });                    
        });
            
        req.write( '' );
        req.end();
    }
    
    if( args.googleUserType === 'user' ){
        console.log( "using oauth 2.0 for initUpload ");
        var authObj = { whit_token: args.token };
        self.googleOAuth.oauth2GetAccessToken(authObj, function(error, data, response){
            if( error ) {
                console.log( error );
                return callback(error, {}, data );
            }
            sendRequest( data.Authorization ); 
        });
    }
    else{
        console.log( "using oauth 1.0 for delete ");
        var auth1Obj = { 
            url: args.file, 
            client_id: self.googleOAuth.config.oauth1ClientId, 
            client_secret: self.googleOAuth.config.oauth1ClientSecret, 
            method: 'DELETE'
        };
        self.googleOAuth.oauth1GetAuthHeader(auth1Obj, function(error, data, response){           
            if( error ) {
                console.log( error );
                return callback(error, {}, data );
            }
            sendRequest( data );  
        });
    }
    
    return;
}



self._getFeedUrl = function(template, data) {
    // use handlebars to inject the email address into the URL specified in the config
    // eg "https://mail.google.com/mail/feed/atom/?xoauth_requestor_id={{email}}"
    var compiledTemplates = {}
      , compiledTemplate = compiledTemplates[template] || (compiledTemplates[template] = hbs.handlebars.compile(template))
      , escapedData = {}
      , keys = Object.keys(data);

    keys.forEach(function(key) {
        escapedData[key] = data[key]; 
    });

    return compiledTemplate(escapedData);
}

self._parseResumableLink = function (links) {
    links.forEach(function(link) {
        if (link.rel === "http://schemas.google.com/g/2005#resumable-edit-media") return link.href;        
    });
}

self._parseAlternateLink = function (links) {
    var altLink = '';
    links.forEach(function(link) {
        if (link.rel == "alternate") altLink = link.href;
    });
    return altLink
}

self._parseDocs = function (docs) {
    
    var ret = [];
    if( docs ) {
        docs.forEach(function(doc) {
            ret.push({ 
                id: doc.gd$resourceId.$t,
                src: self._parseAlternateLink( doc.link ),
                location: null,
                title: doc.title.$t,
                published: doc.published.$t,
                updated: doc.updated.$t,
                type: doc.content.type
            });
        });
    }
    return  ret;
}


function roundNumber(num, dec) {
    return Math.round( num * Math.pow( 10, dec ) ) / Math.pow( 10, dec );
}

function totalLength(arr) {
    var length = 0;
    arr.forEach(function(i) {
        length += i.length; 
    });
    return length;
}

self._getDoctype = function( filename ) {
    var fileExt = filename.substr( filename.lastIndexOf( '.' ) + 1 );
    var type = {           
            doc: "document",
            docx: "document",
            html: "document",
            jpeg: "document",
            odt: "document",
            pdf: "document",
            rtf: "document",
            txt: "document",
            zip: "document",
            jpeg: "noconvert",
            jpg: "noconvert",
            png: "noconvert",
            svg: "drawing",
            ppt: "presentation",
            pptx: "presentation",
            xls: "spreadsheet",
            xlsx: "spreadsheet",
            csv: "spreadsheet",
            pdf: "spreadsheet",
            ods: "spreadsheet",
            tsv: "spreadsheet",
            html: "noconvert",
            pdf: "document",
            mov: "noconvert",
            mp4: "noconvert",
            m4e: "noconvert",
            mpeg: "noconvert",
            mpg: "noconvert"                
    }
    return type[ fileExt ] || "noconvert";
}

self._getMIMEtype = function( filename ) {

  //Get file extension - returns filename if no extension
  var fileExt = filename.substr( filename.lastIndexOf( '.' ) + 1 );
  
  var mimeTypes =  {
      "ez": "application/andrew-inset",
      "ai": "application/illustrator",
      "nb": "application/mathematica",
      "bin": "application/octet-stream",
      "oda": "application/oda",
      "pdf": "application/pdf",
      "xspf": "application/xspf+xml",
      "pla": "audio/x-iriver-pla",
      "pgp": "application/pgp-encrypted",
      "gpg": "application/pgp-encrypted",
      "asc": "text/plain",
      "skr": "application/pgp-keys",
      "pkr": "application/pgp-keys",
      "p7s": "application/pkcs7-signature",
      "p10": "application/pkcs10",
      "ps": "application/postscript",
      "rtf": "application/rtf",
      "siv": "application/sieve",
      "smil": "application/smil",
      "smi": "application/x-sami",
      "sml": "application/smil",
      "kino": "application/smil",
      "sit": "application/stuffit",
      "ged": "application/x-gedcom",
      "gedcom": "application/x-gedcom",
      "flv": "application/x-flash-video",
      "sgf": "application/x-go-sgf",
      "xlf": "application/x-xliff",
      "xliff": "application/x-xliff",
      "cdr": "application/vnd.corel-draw",
      "hpgl": "application/vnd.hp-hpgl",
      "pcl": "application/vnd.hp-pcl",
      "123": "application/vnd.lotus-1-2-3",
      "wk1": "application/vnd.lotus-1-2-3",
      "wk3": "application/vnd.lotus-1-2-3",
      "wk4": "application/vnd.lotus-1-2-3",
      "wks": "application/vnd.lotus-1-2-3",
      "xul": "application/vnd.mozilla.xul+xml",
      "mdb": "application/vnd.ms-access",
      "xls": "application/vnd.ms-excel",
      "xlc": "application/vnd.ms-excel",
      "xll": "application/vnd.ms-excel",
      "xlm": "application/vnd.ms-excel",
      "xlw": "application/vnd.ms-excel",
      "xla": "application/vnd.ms-excel",
      "xlt": "application/vnd.ms-excel",
      "xld": "application/vnd.ms-excel",
      "ppz": "application/vnd.ms-powerpoint",
      "ppt": "application/vnd.ms-powerpoint",
      "pps": "application/vnd.ms-powerpoint",
      "pot": "text/x-gettext-translation-template",
      "xps": "application/vnd.ms-xpsdocument",
      "doc": "application/msword",
      "docx": "application/msword",
      "tnef": "application/vnd.ms-tnef",
      "tnf": "application/vnd.ms-tnef",
      "sdc": "application/vnd.stardivision.calc",
      "sds": "application/vnd.stardivision.chart",
      "sda": "application/vnd.stardivision.draw",
      "sdd": "application/vnd.stardivision.impress",
      "sdp": "application/sdp",
      "smd": "application/vnd.stardivision.mail",
      "smf": "application/vnd.stardivision.math",
      "sdw": "application/vnd.stardivision.writer",
      "vor": "application/vnd.stardivision.writer",
      "sgl": "application/vnd.stardivision.writer",
      "sxc": "application/vnd.sun.xml.calc",
      "stc": "application/vnd.sun.xml.calc.template",
      "sxd": "application/vnd.sun.xml.draw",
      "std": "application/vnd.sun.xml.draw.template",
      "sxi": "application/vnd.sun.xml.impress",
      "sti": "application/vnd.sun.xml.impress.template",
      "sxm": "application/vnd.sun.xml.math",
      "sxw": "application/vnd.sun.xml.writer",
      "sxg": "application/vnd.sun.xml.writer.global",
      "stw": "application/vnd.sun.xml.writer.template",
      "odt": "application/vnd.oasis.opendocument.text",
      "ott": "application/vnd.oasis.opendocument.text-template",
      "oth": "application/vnd.oasis.opendocument.text-web",
      "odm": "application/vnd.oasis.opendocument.text-master",
      "odg": "application/vnd.oasis.opendocument.graphics",
      "otg": "application/vnd.oasis.opendocument.graphics-template",
      "odp": "application/vnd.oasis.opendocument.presentation",
      "otp": "application/vnd.oasis.opendocument.presentation-template",
      "ods": "application/vnd.oasis.opendocument.spreadsheet",
      "ots": "application/vnd.oasis.opendocument.spreadsheet-template",
      "odc": "application/vnd.oasis.opendocument.chart",
      "odf": "application/vnd.oasis.opendocument.formula",
      "odb": "application/vnd.oasis.opendocument.database",
      "odi": "application/vnd.oasis.opendocument.image",
      "sis": "application/vnd.symbian.install",
      "sisx": "x-epoc/x-sisx-app",
      "wp": "application/vnd.wordperfect",
      "wp4": "application/vnd.wordperfect",
      "wp5": "application/vnd.wordperfect",
      "wp6": "application/vnd.wordperfect",
      "wpd": "application/vnd.wordperfect",
      "wpp": "application/vnd.wordperfect",
      "xbel": "application/x-xbel",
      "7z": "application/x-7z-compressed",
      "abw": "application/x-abiword",
      "zabw": "application/x-abiword",
      "cue": "application/x-cue",
      "sam": "application/x-amipro",
      "as": "application/x-applix-spreadsheet",
      "aw": "application/x-applix-word",
      "a": "application/x-archive",
      "arj": "application/x-arj",
      "asp": "application/x-asp",
      "bcpio": "application/x-bcpio",
      "torrent": "application/x-bittorrent",
      "blender": "application/x-blender",
      "blend": "application/x-blender",
      "BLEND": "application/x-blender",
      "bz": "application/x-bzip",
      "bz2": "application/x-bzip",
      "tbz": "application/x-bzip-compressed-tar",
      "tbz2": "application/x-bzip-compressed-tar",
      "cbr": "application/x-cbr",
      "cbz": "application/x-cbz",
      "iso": "application/x-cd-image",
      "iso9660": "application/x-cd-image",
      "cgi": "application/x-cgi",
      "pgn": "application/x-chess-pgn",
      "chm": "application/x-chm",
      "Z": "application/x-tarz",
      "tgz": "application/x-compressed-tar",
      "cpio": "application/x-cpio",
      "csh": "application/x-csh",
      "dbf": "application/x-dbf",
      "es": "application/ecmascript",
      "dc": "application/x-dc-rom",
      "nds": "application/x-nintendo-ds-rom",
      "deb": "application/x-deb",
      "ui": "application/x-designer",
      "desktop": "application/x-desktop",
      "kdelnk": "application/x-desktop",
      "dia": "application/x-dia-diagram",
      "dvi": "application/x-dvi",
      "etheme": "application/x-e-theme",
      "egon": "application/x-egon",
      "exe": "application/x-ms-dos-executable",
      "pfa": "application/x-font-type1",
      "pfb": "application/x-font-type1",
      "gsf": "application/x-font-type1",
      "afm": "application/x-font-afm",
      "bdf": "application/x-font-bdf",
      "psf": "audio/x-psf",
      "pcf": "application/x-font-pcf",
      "spd": "application/x-font-speedo",
      "ttf": "application/x-font-ttf",
      "ttc": "application/x-font-ttf",
      "gb": "application/x-gameboy-rom",
      "gba": "application/x-gba-rom",
      "gen": "application/x-genesis-rom",
      "md": "application/x-genesis-rom",
      "gmo": "application/x-gettext-translation",
      "mo": "application/x-gettext-translation",
      "glade": "application/x-glade",
      "gnucash": "application/x-gnucash",
      "gnc": "application/x-gnucash",
      "xac": "application/x-gnucash",
      "gnumeric": "application/x-gnumeric",
      "gp": "application/x-gnuplot",
      "gplt": "application/x-gnuplot",
      "gnuplot": "application/x-gnuplot",
      "gra": "application/x-graphite",
      "gz": "application/x-gzip",
      "hdf": "application/x-hdf",
      "jar": "application/x-java-archive",
      "class": "application/x-java",
      "jnlp": "application/x-java-jnlp-file",
      "js": "application/javascript",
      "jpr": "application/x-jbuilder-project",
      "jpx": "image/jp2",
      "karbon": "application/x-karbon",
      "chrt": "application/x-kchart",
      "kfo": "application/x-kformula",
      "kil": "application/x-killustrator",
      "flw": "application/x-kivio",
      "kon": "application/x-kontour",
      "kpm": "application/x-kpovmodeler",
      "kpr": "application/x-kpresenter",
      "kpt": "application/x-kpresenter",
      "kra": "application/x-krita",
      "ksp": "application/x-kspread",
      "kud": "application/x-kugar",
      "kwd": "application/x-kword",
      "kwt": "application/x-kword",
      "lha": "application/x-lha",
      "lzh": "application/x-lha",
      "lhz": "application/x-lhz",
      "ts": "application/x-linguist",
      "lyx": "application/x-lyx",
      "lzo": "application/x-lzop",
      "mgp": "application/x-magicpoint",
      "mkv": "video/x-matroska",
      "mka": "audio/x-matroska",
      "ocl": "text/x-ocl",
      "mif": "application/x-mif",
      "wri": "application/x-mswrite",
      "msx": "application/x-msx-rom",
      "m4": "application/x-m4",
      "n64": "application/x-n64-rom",
      "nes": "application/x-nes-rom",
      "cdf": "application/x-netcdf",
      "nc": "application/x-netcdf",
      "o": "application/x-object",
      "ogg": "video/x-theora+ogg",
      "ogx": "application/ogg",
      "oga": "audio/ogg",
      "ogv": "video/ogg",
      "spx": "audio/x-speex",
      "ogm": "video/x-ogm+ogg",
      "oleo": "application/x-oleo",
      "pak": "application/x-pak",
      "pdb": "application/x-palm-database",
      "prc": "application/x-palm-database",
      "PAR2": "application/x-par2",
      "par2": "application/x-par2",
      "pl": "application/x-perl",
      "pm": "application/x-perl",
      "al": "application/x-perl",
      "perl": "application/x-perl",
      "php": "application/x-php",
      "php3": "application/x-php",
      "php4": "application/x-php",
      "p12": "application/x-pkcs12",
      "pfx": "application/x-pkcs12",
      "pln": "application/x-planperfect",
      "pw": "application/x-pw",
      "pyc": "application/x-python-bytecode",
      "pyo": "application/x-python-bytecode",
      "wb1": "application/x-quattropro",
      "wb2": "application/x-quattropro",
      "wb3": "application/x-quattropro",
      "qtl": "application/x-quicktime-media-link",
      "qif": "image/x-quicktime",
      "rar": "application/x-rar",
      "dar": "application/x-dar",
      "rej": "application/x-reject",
      "rpm": "application/x-rpm",
      "rb": "application/x-ruby",
      "mab": "application/x-markaby",
      "shar": "application/x-shar",
      "la": "application/x-shared-library-la",
      "so": "application/x-sharedlib",
      "sh": "application/x-shellscript",
      "swf": "application/x-shockwave-flash",
      "spl": "application/x-shockwave-flash",
      "shn": "application/x-shorten",
      "siag": "application/x-siag",
      "sms": "application/x-sms-rom",
      "gg": "application/x-sms-rom",
      "smc": "application/x-snes-rom",
      "srt": "application/x-subrip",
      "sami": "application/x-sami",
      "sub": "text/x-mpsub",
      "ssa": "text/x-ssa",
      "ass": "text/x-ssa",
      "sv4cpio": "application/x-sv4cpio",
      "sv4crc": "application/x-sv4crc",
      "tar": "application/x-tar",
      "gtar": "application/x-tar",
      "gf": "application/x-tex-gf",
      "pk": "application/x-tex-pk",
      "obj": "application/x-tgif",
      "theme": "application/x-theme",
      "bak": "application/x-trash",
      "old": "application/x-trash",
      "sik": "application/x-trash",
      "tr": "text/troff",
      "roff": "text/troff",
      "t": "text/troff",
      "man": "application/x-troff-man",
      "tzo": "application/x-tzo",
      "ustar": "application/x-ustar",
      "src": "application/x-wais-source",
      "wpg": "application/x-wpg",
      "der": "application/x-x509-ca-cert",
      "cer": "application/x-x509-ca-cert",
      "crt": "application/x-x509-ca-cert",
      "cert": "application/x-x509-ca-cert",
      "pem": "application/x-x509-ca-cert",
      "zoo": "application/x-zoo",
      "xhtml": "application/xhtml+xml",
      "zip": "application/zip",
      "ac3": "audio/ac3",
      "amr": "video/3gpp",
      "awb": "audio/AMR-WB",
      "au": "audio/basic",
      "snd": "audio/basic",
      "sid": "audio/prs.sid",
      "psid": "audio/prs.sid",
      "aiff": "audio/x-aiff",
      "aif": "audio/x-aiff",
      "aifc": "audio/x-aiff",
      "ape": "audio/x-ape",
      "it": "audio/x-it",
      "flac": "audio/x-flac",
      "wv": "audio/x-wavpack",
      "wvp": "audio/x-wavpack",
      "wvc": "audio/x-wavpack-correction",
      "mid": "audio/midi",
      "midi": "audio/midi",
      "kar": "audio/midi",
      "m4a": "audio/mp4",
      "aac": "audio/mp4",
      "mp4": "video/mp4",
      "m4v": "video/mp4",
      "m4b": "audio/x-m4b",
      "3gp": "video/3gpp",
      "3gpp": "video/3gpp",
      "mod": "audio/x-mod",
      "ult": "audio/x-mod",
      "uni": "audio/x-mod",
      "m15": "audio/x-mod",
      "mtm": "audio/x-mod",
      "669": "audio/x-mod",
      "mp2": "video/mpeg",
      "mp3": "audio/mpeg",
      "mpga": "audio/mpeg",
      "m3u": "audio/x-mpegurl",
      "vlc": "audio/x-mpegurl",
      "asx": "audio/x-ms-asx",
      "wax": "audio/x-ms-asx",
      "wvx": "audio/x-ms-asx",
      "wmx": "audio/x-ms-asx",
      "minipsf": "audio/x-minipsf",
      "psflib": "audio/x-psflib",
      "wma": "audio/x-ms-wma",
      "mpc": "audio/x-musepack",
      "mpp": "audio/x-musepack",
      "ra": "audio/vnd.rn-realaudio",
      "rax": "audio/vnd.rn-realaudio",
      "ram": "application/ram",
      "rv": "video/vnd.rn-realvideo",
      "rvx": "video/vnd.rn-realvideo",
      "rm": "application/vnd.rn-realmedia",
      "rmj": "application/vnd.rn-realmedia",
      "rmm": "application/vnd.rn-realmedia",
      "rms": "application/vnd.rn-realmedia",
      "rmx": "application/vnd.rn-realmedia",
      "rmvb": "application/vnd.rn-realmedia",
      "rp": "image/vnd.rn-realpix",
      "rt": "text/vnd.rn-realtext",
      "s3m": "audio/x-s3m",
      "pls": "audio/x-scpls",
      "stm": "audio/x-stm",
      "voc": "audio/x-voc",
      "wav": "audio/x-wav",
      "xi": "audio/x-xi",
      "xm": "audio/x-xm",
      "tta": "audio/x-tta",
      "bmp": "image/bmp",
      "wbmp": "image/vnd.wap.wbmp",
      "cgm": "image/cgm",
      "g3": "image/fax-g3",
      "gif": "image/gif",
      "ief": "image/ief",
      "jpeg": "image/jpeg",
      "jpg": "image/jpeg",
      "jpe": "image/jpeg",
      "jp2": "image/jp2",
      "jpc": "image/jp2",
      "j2k": "image/jp2",
      "jpf": "image/jp2",
      "dds": "image/x-dds",
      "pict": "image/x-pict",
      "pict1": "image/x-pict",
      "pict2": "image/x-pict",
      "ufraw": "application/x-ufraw",
      "dng": "image/x-adobe-dng",
      "crw": "image/x-canon-crw",
      "cr2": "image/x-canon-cr2",
      "raf": "image/x-fuji-raf",
      "dcr": "image/x-kodak-dcr",
      "k25": "image/x-kodak-k25",
      "kdc": "image/x-kodak-kdc",
      "mrw": "image/x-minolta-mrw",
      "nef": "image/x-nikon-nef",
      "orf": "image/x-olympus-orf",
      "raw": "image/x-panasonic-raw",
      "pef": "image/x-pentax-pef",
      "x3f": "image/x-sigma-x3f",
      "srf": "image/x-sony-srf",
      "sr2": "image/x-sony-sr2",
      "arw": "image/x-sony-arw",
      "png": "image/png",
      "rle": "image/rle",
      "svg": "image/svg+xml",
      "svgz": "image/svg+xml-compressed",
      "tif": "image/tiff",
      "tiff": "image/tiff",
      "dwg": "image/vnd.dwg",
      "dxf": "image/vnd.dxf",
      "3ds": "image/x-3ds",
      "ag": "image/x-applix-graphics",
      "ras": "image/x-cmu-raster",
      "dcm": "application/dicom",
      "docbook": "application/docbook+xml",
      "djvu": "image/vnd.djvu",
      "djv": "image/vnd.djvu",
      "eps": "image/x-eps",
      "epsi": "image/x-eps",
      "epsf": "image/x-eps",
      "fits": "image/x-fits",
      "ico": "image/x-ico",
      "icns": "image/x-icns",
      "iff": "image/x-iff",
      "ilbm": "image/x-ilbm",
      "jng": "image/x-jng",
      "lwo": "image/x-lwo",
      "lwob": "image/x-lwo",
      "lws": "image/x-lws",
      "pntg": "image/x-macpaint",
      "msod": "image/x-msod",
      "pcd": "image/x-photo-cd",
      "pnm": "image/x-portable-anymap",
      "pbm": "image/x-portable-bitmap",
      "pgm": "image/x-portable-graymap",
      "ppm": "image/x-portable-pixmap",
      "psd": "image/x-psd",
      "rgb": "image/x-rgb",
      "sgi": "image/x-sgi",
      "sun": "image/x-sun-raster",
      "icb": "image/x-tga",
      "tga": "image/x-tga",
      "tpic": "image/x-tga",
      "vda": "image/x-tga",
      "vst": "image/x-tga",
      "cur": "image/x-win-bitmap",
      "emf": "image/x-emf",
      "wmf": "image/x-wmf",
      "xbm": "image/x-xbitmap",
      "xcf": "image/x-xcf",
      "fig": "image/x-xfig",
      "xpm": "image/x-xpixmap",
      "xwd": "image/x-xwindowdump",
      "wrl": "model/vrml",
      "vcs": "text/calendar",
      "ics": "text/calendar",
      "css": "text/css",
      "CSSL": "text/css",
      "vcf": "text/directory",
      "vct": "text/directory",
      "gcrd": "text/directory",
      "t2t": "text/x-txt2tags",
      "vhd": "text/x-vhdl",
      "vhdl": "text/x-vhdl",
      "mml": "text/mathml",
      "txt": "text/plain",
      "rdf": "text/rdf",
      "rdfs": "text/rdf",
      "owl": "text/rdf",
      "rtx": "text/richtext",
      "rss": "application/rss+xml",
      "atom": "application/atom+xml",
      "opml": "text/x-opml+xml",
      "sgml": "text/sgml",
      "sgm": "text/sgml",
      "sylk": "text/spreadsheet",
      "slk": "text/spreadsheet",
      "tsv": "text/tab-separated-values",
      "jad": "text/vnd.sun.j2me.app-descriptor",
      "wml": "text/vnd.wap.wml",
      "wmls": "text/vnd.wap.wmlscript",
      "ace": "application/x-ace",
      "adb": "text/x-adasrc",
      "ads": "text/x-adasrc",
      "bib": "text/x-bibtex",
      "hh": "text/x-c++hdr",
      "hp": "text/x-c++hdr",
      "hpp": "text/x-c++hdr",
      "hxx": "text/x-c++hdr",
      "cpp": "text/x-c++src",
      "cxx": "text/x-c++src",
      "cc": "text/x-c++src",
      "C": "text/x-c++src",
      "h": "text/x-chdr",
      "csv": "text/csv",
      "c": "text/x-csrc",
      "cs": "text/x-csharp",
      "vala": "text/x-vala",
      "dcl": "text/x-dcl",
      "dsl": "text/x-dsl",
      "d": "text/x-dsrc",
      "dtd": "text/x-dtd",
      "el": "text/x-emacs-lisp",
      "erl": "text/x-erlang",
      "for": "text/x-fortran",
      "po": "text/x-gettext-translation",
      "html": "text/html",
      "htm": "text/html",
      "gvp": "text/x-google-video-pointer",
      "hs": "text/x-haskell",
      "idl": "text/x-idl",
      "java": "text/x-java",
      "ldif": "text/x-ldif",
      "lhs": "text/x-literate-haskell",
      "log": "text/x-log",
      "moc": "text/x-moc",
      "mup": "text/x-mup",
      "not": "text/x-mup",
      "m": "text/x-matlab",
      "ml": "text/x-ocaml",
      "mli": "text/x-ocaml",
      "p": "text/x-pascal",
      "pas": "text/x-pascal",
      "diff": "text/x-patch",
      "patch": "text/x-patch",
      "py": "text/x-python",
      "lua": "text/x-lua",
      "nfo": "text/x-readme",
      "spec": "text/x-rpm-spec",
      "scm": "text/x-scheme",
      "etx": "text/x-setext",
      "sql": "text/x-sql",
      "tcl": "text/x-tcl",
      "tk": "text/x-tcl",
      "tex": "text/x-tex",
      "ltx": "text/x-tex",
      "sty": "text/x-tex",
      "cls": "text/x-tex",
      "dtx": "text/x-tex",
      "ins": "text/x-tex",
      "latex": "text/x-tex",
      "texi": "text/x-texinfo",
      "texinfo": "text/x-texinfo",
      "me": "text/x-troff-me",
      "mm": "text/x-troff-mm",
      "ms": "text/x-troff-ms",
      "uil": "text/x-uil",
      "uri": "text/x-uri",
      "url": "text/x-uri",
      "xmi": "text/x-xmi",
      "fo": "text/x-xslfo",
      "xslfo": "text/x-xslfo",
      "xml": "application/xml",
      "xsl": "application/xml",
      "xslt": "application/xml",
      "xbl": "application/xml",
      "dv": "video/dv",
      "mpeg": "video/mpeg",
      "mpg": "video/mpeg",
      "mpe": "video/mpeg",
      "vob": "video/mpeg",
      "m2t": "video/mpeg",
      "qt": "video/quicktime",
      "mov": "video/quicktime",
      "moov": "video/quicktime",
      "qtvr": "video/quicktime",
      "qtif": "image/x-quicktime",
      "viv": "video/vivo",
      "vivo": "video/vivo",
      "fli": "video/x-flic",
      "flc": "video/x-flic",
      "hwp": "application/x-hwp",
      "hwt": "application/x-hwt",
      "mng": "video/x-mng",
      "asf": "video/x-ms-asf",
      "nsc": "application/x-netshow-channel",
      "wmv": "video/x-ms-wmv",
      "avi": "video/x-msvideo",
      "divx": "video/x-msvideo",
      "nsv": "video/x-nsv",
      "movie": "video/x-sgi-movie",
      "emp": "application/vnd.emusic-emusic_package",
      "ica": "application/x-ica",
      "602": "application/x-t602"
  };
  
  return mimeTypes[ fileExt ];
         
}
