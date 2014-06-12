
var self = module.exports;

/**
 * A closure that returns the result callback wrapped with the scope of the 
 * request and response
 */
function resultCallback(req, res) {
    return function(error, response, data) {
        var jsendWrapper = (error) ? {
            status: 'error',
            code: (response && response.statusCode) || 500,
            error: error
        } : {
            status: 'success',
            code: response.statusCode,
            data: data
        };

        // if there is a callback parameter then assume JSONP
        if(req.isJSONP) {
            var jsonpWrapper = req.query.callback + "(" + JSON.stringify(jsendWrapper) + ")";
            // always send 200 for JSONP requests
            res.send(jsonpWrapper, { 'Content-Type': 'text/javascript' }, 200);
        }
        else if ( req.iframe ) {
            res.send(jsendWrapper, { 'Content-Type': 'text/html' }, response.statusCode);
        }            
        else {
            res.send(jsendWrapper, { 'Content-Type': 'application/json' }, response.statusCode);
        }                
    };
}

self.resultCallback = resultCallback;