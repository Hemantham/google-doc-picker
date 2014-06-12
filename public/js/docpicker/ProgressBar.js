dojo.provide( 'docpicker.ProgressBar' );

dojo.require( 'dijit.ProgressBar' );

dojo.declare( 'docpicker.ProgressBar', dijit.ProgressBar, {
    aborted: false,
    abortHandle: null, //abort connect handle

	/**
	 * Instantiates the progress bar.
	 * @param {object} props
	 */
	constructor: function( props ) {
		dojo.safeMixin( this, props );
		
		// extend dijit template string
		this.set( 'templateString', 
		    dojo.replace( 
                dojo.cache( "docpicker.resources", "ProgressBar.html", {sanitize: true} ), 
                { template: this.get( 'templateString' ) } 
            ) 
        );
	},

	/**
	 * Setup the bar's button/link events.
	 */
	postCreate: function() {
        var pickerBar = dojo.query( '.pickerBar', this.domNode )[ 0 ];
        this.abortHandle = dojo.connect( pickerBar, 'onclick', this, this.abort );
	},

	complete: function() {
		this.set( 'value', this.maximum );
		this.pickerCancelMsg = dojo.query( '.pickerCancelMsg', this.domNode )[ 0 ];
		this.pickerCancelMsg.innerHTML = 'Finished';
		
        dojo.connect( this.pickerTrash, 'click', this, this.remove );
        dojo.addClass( this.pickerTrash, 'pickerTrashActive' );
        dojo.addClass( this.pickerCancelMsg, 'pickerCancelInactive' );
        dojo.disconnect( this.abortHandle );
        this.onComplete();
	},

	/**
	 * Sets the bar to its error state.
	 * @param {object} err error
	 */
	error: function( err ) {
        var msg = '<span class="pickerErrMsg">Error</span>';
        this.pickerCancelMsg = dojo.query( '.pickerCancelMsg', this.domNode )[ 0 ];
        this.pickerCancelMsg.innerHTML = 'Error';
		this.onError( err );
        dojo.disconnect( this.abortHandle );
	},

	/**
	 * Sets the bar to the aborted state.
	 */
	abort: function() {
		this.aborted = true;
        this.pickerCancelMsg = dojo.query( '.pickerCancelMsg', this.domNode )[ 0 ];
        this.pickerCancelMsg.innerHTML = '<span class="errMsg">Canceled</span>';
		this.onAbort();
        dojo.disconnect( this.abortHandle );
        dojo.connect( this.pickerTrash, 'click', this, this.removeBarContainer );
	},

    /**
     * All data is sent
     * Indeterminate state
     * Usually this occurs when google is converting the doc
     */	
	wait: function() {
		this.set( 'value', Infinity );
        this.pickerCancelMsg = dojo.query( '.pickerCancelMsg', this.domNode )[ 0 ];
        this.pickerCancelMsg.innerHTML = '<span class="errMsg">Waiting for Google</span>';
        dojo.disconnect( this.abortHandle );
	},

	remove: function() {
        this.onDelete();
	},

	removeBarContainer: function( barCount ) { 
        dojo.fadeOut( {
            node: this.id,
            duration: 500,
            onEnd: dojo.hitch( this, function() {
                dojo.destroy( this.id );
                if( barCount == 0 ){
                    dojo.removeClass( 'pickerActionContainer', 'pickerActionScrollContainer' );
                    dojo.addClass( 'pickerActionContainer', 'pickerActionContainer' );
                }
            } )
        } ).play();
    },
	
    removeBusy: function() {
        dojo.addClass( this.pickerTrash, 'pickerTrashBusy' );
    },
    
	/**
	 * Callback when user cancels upload
	 * Called when user clicks cancel link/button
	 * Stub to override
	 */
	onAbort: function() {},

    /**
     * Callback on deleting progress bar.
     * Called when user clicks delete link/button
     * Stub to override
     */
    onDelete: function() {},
    
    /**
     * Callback on complete of upload.
     * Updates the doc list
     * Stub to override
     */
    onDelete: function() {},

	/**
	 * Callback on error
	 * Stub to override
	 */
	onError: function() {}
	
});
