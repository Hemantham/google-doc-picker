dojo.provide( 'docpicker.UploaderSingle' );

dojo.require( 'dojo.io.iframe' );
dojo.require( 'docpicker.ProgressBar' );

dojo.declare( 'docpicker.UploaderSingle', null, {
	
	constructor: function( props ) {
	    dojo.safeMixin( this, props );
	},
	
    uploadSingleFile: function( filename ){     
        var self = this;
        dojo.empty( dojo.byId( "pickerIeBar" ) );
        var barTemplate = dojo.cache( "docpicker.resources", "SingleUploader.html", {sanitize: true} )
        var bar = new docpicker.ProgressBar( {
            result: {},
            label: mustache( barTemplate, {
                icon: docpicker.Util.getDocIcon( filename ),
                file: filename
            } ),                           
            maximum: 100,
            value: 0
        }, dojo.create( 'div', {}, 'pickerIeBar' ) );
        bar.set( 'value', 30 );
        
        var errorStr = null;
        
        var args = {
            url: dojo.replace( '{0}/api/upload?filename={1}&token={2}', 
                [ docpicker.Util.serviceRoot(), filename,  this.token ]),
            form: "frmIO",
            method: "post",
            timeoutSeconds: 30,
            preventCache: true,
            handleAs: "text",
            handle: function(data, ioArgs){
              if ( data === '400' || errorStr ){
                dojo.removeClass( dojo.byId( "pickerIeBarMsg" ), 'pickerIeTrashBusy' );
                dojo.byId( "pickerIeBarMsg" ).innerHTML =  "Error";
              }
              else {
                  var resultArr = data.split( ',' );
                  var result = {
                      id: resultArr[0],
                      src: resultArr[1],
                      location: resultArr[2],
                      title: resultArr[3],
                      published: resultArr[4],
                      updated: resultArr[5],
                      type: resultArr[6],
                      link: resultArr[1]
                  
                  }

                  bar.set( 'value', 100 );
                  dojo.removeClass( dojo.byId( "pickerIeBarMsg" ), 'pickerIeTrashBusy' );
                  dojo.byId( "pickerIeBarMsg" ).innerHTML = "Finished";
                
                  var trash = dojo.query( '.pickerTrash', self.pickerUploadHTML5 )[0]
                  dojo.addClass( trash, 'pickerTrashActive' );
                  dojo.connect( trash, 'click', function() {
                      self.deleteSingleFile( data, bar ); 
                  } );
                  dojo.empty( dojo.byId( 'pickerIeFileInfo' ) );
                  result.datetime = docpicker.Util.formatDate( result.updated, new Date() );
                  self.pickerEmitter.emit( 'selected', [ result ]);
              }                
            },
            error: function( err, ioArgs ) {
                console.log( err );

                dojo.removeClass( dojo.byId( "pickerIeBarMsg" ), 'pickerIeTrashBusy' );
                dojo.byId( "pickerIeBarMsg" ).innerHTML = "Error";

            }
        }
        dojo.io.iframe.send( args );
        bar.set( 'value', 50 );
    },
    
    /**
     * Sends request to delete file on remote server.
     * @param {string} fileName name of file to delete
     * @param {docpicker.ProgressBar} bar
     * @return {dojo.Deferred}
     */
    deleteSingleFile: function( file, bar ) {
      var self = this;
      bar.removeBusy();
      var args = {
          url: dojo.replace( '{0}/api/delete?token={2}', 
              [ docpicker.Util.serviceRoot(), this.token ]),
          callbackParamName: 'callback',
          preventCache: true,
          handleAs: 'json',
          headers: { 'Content-Type': 'application/json' },             
          postData: dojo.toJson( {
              file: file
          } ),
          load: function( data ) {
                var node = dojo.query( '.pickerBarContainer', self.pickerUploadHTML5)[0]
                if ( data.code === '200' ){
                    dojo.fadeOut( {
                        node: node,
                        duration: 500,
                        onEnd: dojo.hitch( this, function() {
                          self.search.load();
                          dojo.destroy( node );
                        } )
                    } ).play();                         
                }
                else{
                  dojo.byId( "pickerIeBarMsg" ).innerHTML = "Error Deleting";
                    console.log( data.code );
                    bar.error();
                }
            },
            error: function( err ) {
                console.log( err );
                dojo.byId( "pickerIeBarMsg" ).innerHTML = "Error Deleting";
            }
      };
  
      if( docpicker.Util.hasCors() ) {
          dojo.xhrPost( args );
      } else {
          args.content = {
              _body: args.postData,
              _method: 'POST'
          }
          dojo.io.script.get( args );              
      }
    },

});

