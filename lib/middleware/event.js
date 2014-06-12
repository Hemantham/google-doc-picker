var self = module.exports
  , url = require('url');

// Express/Connect Middleware functions


/**
 * Buffers data and end events so they 
 * will fire after token validation occurs
 *  
 **/
self.bufferUploadEvents = function() {
    return function bufferUploadEvents(req, res, next) {
        var token = req.headers["x-authorization"] || req.query.token;
        
        var path = url.parse( req.url ).pathname
        
        if(token && path == '/api/upload') {
          new self._eventBuffer( req );
        }
        next();
    }
};

//Buffer events for uploads
self._eventBuffer = function(req) {
    var self = this
      , buffer = []
      , ended  = false
      , ondata = null
      , onend  = null
      , formcomplete = null;

    self.ondata = function( f ) {
      for( var i = 0; i < buffer.length; i++ ) {
        f( buffer[i] );
      }
      ondata = f;
    }

    self.onend = function( f ) {
      onend = f;
      if( ended ) {
        onend();
      }
    }
    
    req.on( 'data', function( chunk ) {
      if( ondata ) {
        ondata( chunk );
      }
      else {
        buffer.push( chunk );
      }
    });

    req.on( 'end', function() {
      ended = true;
      if( onend ) {
        onend();
      }
    });        

    req.eventbuffer = self;
}
