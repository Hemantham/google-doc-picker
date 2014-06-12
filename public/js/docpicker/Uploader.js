dojo.provide( 'docpicker.Uploader' );

dojo.require( 'docpicker.ProgressBar' );
dojo.require( 'docpicker.Notifier' );

dojo.require( 'dojo.io.script' );

dojo.declare( 'docpicker.Uploader', [ dijit._Widget,dijit._Templated ], {
    templateString: dojo.cache( "docpicker.resources", "Uploader.html", {sanitize: true} ),
	maxKBytes: 50000,	   // 50MB
	maxNumFiles: 10, 	   // limited by php.ini directive max_file_uploads
	bytesOverall: 0,
    barCount: 0,
	files: [],           // files that will be uploaded after checking their length and max allowed number of uploads
	progressBars: [],    // keeps track of created bars
	displayTarget: null, // for progress bars
	dropTarget: null,
	barsCompleted: 0,
	token: null,
	
	/**
	 * Instantiates the uploader
	 * Expects object with following properties:
	 *    id:      // {String|Object} DomNode or id of element that the progress bars are created in.
	 *    url:     // {String} url that handles the upload
	 *    target:  // {String|Object} DomNode or id of element where files can be dropped onto
	 *
	 * @param {Object} props arguments
	 */
	constructor: function( props ) {

		props.dropTarget = dojo.byId( 'dropTarget' );
		dojo.safeMixin( this, props );
		
		this.maxKBytes *= 1048;    // e.g. * (1024 + 24)

		// add drag and drop events
		dojo.connect( window, 'dragover', function( evt ) {
			dojo.stopEvent( evt );
		} );
		dojo.connect( window, 'drop', function( evt ) {
			dojo.stopEvent( evt );
		});
        dojo.connect( this.dropTarget, 'dragover', function( evt ) {
            dojo.addClass( this, 'pickerTargetActive' );
            dojo.stopEvent( evt );
        } );
		dojo.connect( this.dropTarget, 'dragenter', function() {
			dojo.addClass( this, 'pickerTargetActive' );
		});
		dojo.connect( this.dropTarget, 'dragleave', function( evt ) {
			dojo.removeClass( this, 'pickerTargetActive' );
		});
		dojo.connect( this.dropTarget, 'mouseout', function( evt ) {
			dojo.removeClass(this, 'pickerTargetActive');
		});
		dojo.connect( this.dropTarget, 'drop', this, function( evt ) {
            dojo.removeClass( 'pickerActionContainer', 'pickerActionContainer' );
            dojo.addClass( 'pickerActionContainer', 'pickerActionScrollContainer' );
			var files = evt.dataTransfer.files;
			this.addFiles( files );
			dojo.removeClass( this.dropTarget, 'pickerTargetActive' );
		});
	},

	/**
	 * Add and filter files to upload.
	 * Add files to internal array and calc total amount of bytes to upload. Also check for size and number of uploads limit.
	 * @param {Array} files instance of FileList object
	 */
	addFiles: function( files ) {
		var dfds = [], idx;
		dfds[ 0 ] = new dojo.Deferred();
		dfds[ 0 ].resolve( false );

		// exclude files that are to large
		// and chain deferreds so the get fired one after the other
		this.files = dojo.filter( files, function( file ) {
			idx = dfds.length - 1;
			var self = this;
			if( file.size > this.maxKBytes ) {
				dfds[ idx + 1 ] = dfds[ idx ].then( function( remember ) {
					if ( !remember ) {
						return files.length > 1 ? self.confirmFileSize( file.fileName ) : self.confirmFileSizeSingle( file.fileName );
					}
					else {
						var dfd = new dojo.Deferred();
						dfd.resolve( true );
						return dfd;
					}
				});
				return false;
			}
			else {
				this.bytesOverall += file.size;
				return true;
			}
		}, this);

		// limit number of files you can upload
		if ( this.files.length > this.maxNumFiles ) {
			this.files = this.files.slice( 0, this.maxNumFiles );
			idx = dfds.length - 1;
			dfds[ idx + 1 ] = dfds[ idx ].then( dojo.hitch( this, function() {
				return this.confirmNumFileLimit( this.maxNumFiles );
			} ) );
		}

		dfds[ dfds.length - 1 ].then( dojo.hitch( this, function() {
			this.createBars();
			this.uploadFiles();
			dfds = null;   // free memory
		} ) );
	},

	/**
	 * Creates a progress bar for each file and uploads it.
	 */
	createBars: function() {
		var self = this;
		var container;
		var i = 0, len = this.files.length;
		if ( len === 0 ) return false;
		
		container = dojo.create( 'div', {
				id: 'pickerUploader',
				innerHTML: this.uploaderBarContainer.innerHTML
			}, this.displayTarget );
		dojo.addClass( container.id, 'pickerUploader' );

		// create containers for individual progress bars
		for ( ; i < len; i++ ) {
			( function( i ) {
				var file = self.files[ i ];
				
				var bar = new docpicker.ProgressBar( {
		            label: mustache( self.uploaderBar.innerHTML, {
	                    icon: docpicker.Util.getDocIcon( file.name ),
	                    file: file.name,
	                    size: self.formatSize( file.size )
	                } ),					       
					bytesTotal: file.size,
					maximum: file.size,
					value: 0
				}, dojo.create( 'div', {}, 'pickerBarsCont' ) );
				
				self.barCount++;
 
				dojo.connect( bar, 'onError', function() {
                    self.uploadError( file, bar );
                });				
                dojo.connect( bar, 'onDelete', function() {
                    self.deleteFile( file, bar );
                });
                dojo.connect( bar, 'onComplete', function() {
                    self.complete( file, bar );
                });
				dojo.connect( bar, 'onAbort', function() {
					self.abort( file, bar );
					self.progressBars[ i ] = null;
					self.files[ i ] = null;
				});
				self.progressBars[ i ] = bar;
			})(i);
		}
	},

	/**
	 * Upload all dropped files that don't exceed size and number of files limit.
	 */
	uploadFiles: function() {
		var i = 0, len = this.files.length;
		for ( ; i < len; i++ ) {
			this.upload(this.files[ i ], this.progressBars[ i ]);
		}
	},

	/**
	 * Upload file via XmlHttpRequest.
	 * Reads file into binary string and uploads it while displays its progress.
	 * @param {File} file file to upload
	 * @param {docpicker.ProgressBar} bar progress bar
	 */
	upload: function( file, bar ) {
		// Use native XMLHttpRequest instead of XhrGet since dojo 1.6 does not allow to send binary data as per docs
		var req = bar.xhr = new XMLHttpRequest();
		var dfd = this.setReadyStateChangeEvent( req, bar );
		this.setProgressEvent( req, bar );
		req.open( 'put', this.url, true );
		req.setRequestHeader( 'Cache-Control', 'no-cache' );
		req.setRequestHeader( 'X-Requested-With', 'XMLHttpRequest' );
		req.setRequestHeader( 'X-File-Name', file.name );
		req.setRequestHeader( 'X-File-Size', file.size );
		req.setRequestHeader( 'X-File-Type', file.type || docpicker.Util.getMIMEtype( file.name ) || 'application/octet-stream' );
		req.send(file);
		return dfd;
	},

	/**
	 * Displays upload status and errors.
	 * @param {XMLHttpRequest} req
	 * @param {docpicker.ProgressBar} bar
	 */
	setReadyStateChangeEvent: function( req, bar ) {
		var dfd = new dojo.Deferred();
		dojo.connect( req, 'readystatechange', this, function() {
			var err = null;
			if ( req.readyState == 4 ) {
				// upload finished successful
				if ( req.status == 200 || req.status == 201 ) {
				    console.log( req.responseText );
				    if( typeof( req.responseText ) != 'undefined' )
				        bar.result = dojo.fromJson( req.responseText ).data.result;
				    else
                        bar.result = dojo.fromJson( req.response ).data.result;
                    bar.complete();
					dfd.resolve();
				}
				else {
					// server error or user aborted (canceled)
 					if ( req.status === 0 && ( bar.aborted || bar.paused ) ) {
						// User canceled or paused upload. Not an error.
						dfd.resolve();
					}
					else {
					   err = {
							statusCode: req.status,
							statusText: req.statusText,
							responseText: req.responseText
						};
						if ( req.statusText == '' ) {
							err.responseText = 'Unknown error.';
						}
						bar.error( err );
						//not sure if this is a good fix
					    if( typeof dfd.results !== 'undefined' && dfd.results[ 0 ] ){				        
					        dfd.reject();
					    }
					}
				}
				req = null;
				bar.xhr = null;
			}
		} );
		return dfd;
	},

	/**
	 * Setup the progress event to display upload progress.
	 * @param {XMLHttpRequest} req
	 * @param {docpicker.ProgressBar} bar
	 * @param {number} [resumeStart]
	 */
	setProgressEvent: function( req, bar, resumeStart ) {
		var cnn = dojo.connect( req.upload, 'progress', function( evt ) {
			var loaded = evt.loaded + ( resumeStart || 0 );
			if ( evt.lengthComputable ) {
				//var num = Math.round((evt.total - loaded) / evt.total * 1000);
				var num = Math.round( loaded / evt.total * 100 ); // find better measure, see below
				bar.set( 'value', loaded );
				if ( num == 100 && (!arguments.callee.done === true ) ) {
					// TODO: find better ways to decide when we switch to indeterminate
					// in FF4 never evt.loaded == bar.maximum, but in chrome
					// see https://bugzilla.mozilla.org/show_bug.cgi?id=637002
					arguments.callee.done = true;
					dojo.disconnect( cnn ); // make sure this only gets called once per bar => use disconnect
					bar.wait();  // upload is complete but file has not been written to disk, waits for status 200
				}
			}
		} );
	},

	/**
	 * Sends request to delete file on remote server.
	 * @param {string} fileName name of file to delete
	 * @param {docpicker.ProgressBar} bar
	 * @return {dojo.Deferred}
	 */
	deleteFile: function( fileName, bar ) {
	    var self = this;
	    bar.removeBusy();
        var args = {
                url: dojo.replace( '{0}/api/delete?token={1}', [ docpicker.Util.serviceRoot(), this.token ]),
                callbackParamName: 'callback',
                preventCache: true,
                handleAs: 'json',
                headers: { 'Content-Type': 'application/json' },             
                postData: dojo.toJson( {
                    file: bar.result.location
                } ),
                load: function( data ) {
                    if ( data.code === '200' ){
                        self.barCount--;
                        bar.removeBarContainer( self.barCount );
                        //self.docStore.remove( bar.result.id );
                    }
                    else{
                        console.log( "delete file error" );
                        console.log( data.code );
                        bar.error();
                    }
                },
                error: function( err ) {
                    console.log( err );
                    bar.error();
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

	/**
	 * Aborts the upload.
	 * @param {File} file
	 * @param {docpicker.ProgressBar} bar
	 */
	abort: function( file, bar ) {
		if ( bar.xhr ) {
			bar.xhr.abort();
		}
		this.barsCompleted++;
		bar.xhr = null;
		bar = null;
        if( this.barsCompleted >= this.barCount ){
            this.pickerEmitter.emit( 'selected', this.tempStore.query( null ) );
        }
	},

    /**
     * Updates the Doc listl
     * @param {File} file
     * @param {docpicker.ProgressBar} bar
     */
    complete: function( file, bar ) {
        bar.result.link = bar.result.src;
        
        bar.result.datetime = docpicker.Util.formatDate( bar.result.updated, new Date() );
        this.tempStore.put( bar.result, true );
        this.barsCompleted++;
        if( this.barsCompleted >= this.barCount ){
            this.pickerEmitter.emit( 'selected', this.tempStore.query( null ) );
        }
    },

    /**
     * Updates the Doc listl
     * @param {File} file
     * @param {docpicker.ProgressBar} bar
     */
    uploadError: function( file, bar ) {
        this.barsCompleted++;
        if( this.barsCompleted >= this.barCount ){
            this.pickerEmitter.emit( 'selected', this.tempStore.query( null ) );
        }
    },

	/**
	 * Resets the uploader
	 */
	reset: function() {
		this.bytesOverall = 0;
		this.files = [];
		this.progressBars = [];
	},

    /**
     * Shows a notifier to confirm skipping files that are to big.
     * @param {String} fileName name of file
     */
    confirmFileSize: function( fileName ) {
        docpicker.notify( 'Maximum file size is limited to ' + this.formatSize( this.maxKBytes ) + 
                '. Uploading file that are larger will be canceled.');

    },

    /**
     * Shows a notifier to confirm not uploading file that is to big (only one file overall).
     * Used only when there is a single file to upload.
     * @param {String} fileName name of file
     */
    confirmFileSizeSingle: function( fileName ) {
        docpicker.notify( 'Maximum file size is limited to ' + this.formatSize( this.maxKBytes ) + '. Uploading file ' +
              fileName + ' will be canceled.');
    },

    /**
     * Shows a notifier to confirm skipping the remaining files.
     * If the limit of number of files that can be uploaded is reached the remaining files are skipped.
     * @param {number} limit maximum number of files that can be uploaded
     */
    confirmNumFileLimit: function( limit ) {
        docpicker.notify( 'Maximum number of files to upload is limited to ' + limit + ',<br />' +
                'only the first ' + limit + ' will be uploaded');
    },

    /**
     * Displays a notifier to confirm that current browser is not supported.
     */
    confirmHasFeatures: function() {
        docpicker.error( 'Your browser doesn\'t support HTML5 multiple drag and drop upload.<br />' +
                'Consider downloading Google Chrome.');
    },
    
	/**
	 * Format file size.
	 * @param {Number} bytes
	 */
	formatSize: function( bytes ) {
		var str = [ 'bytes', 'kb', 'MB', 'GB', 'TB', 'PB' ];
		var num = Math.floor( Math.log( bytes ) / Math.log( 1024 ) );
		bytes = bytes === 0 ? 0 : ( bytes / Math.pow( 1024, Math.floor( num ) ) ).toFixed( 1 ) + ' ' + str[ num ];
		return bytes;
	}
});

