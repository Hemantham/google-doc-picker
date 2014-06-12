dojo.provide( 'docpicker.DocsDialog' );

dojo.require( 'dijit._Widget' );
dojo.require( 'dijit._Templated' ); 

dojo.require( 'dojox.form.Uploader' );
dojo.require( 'dijit.form.TextBox' );
dojo.require( 'dijit.form.Button' );
dojo.require( 'dojo.store.Memory' );
dojo.require( 'dojo.store.Observable' );
dojo.require( 'docpicker.SearchSelect' );
dojo.require( 'docpicker.Uploader' );
dojo.require( 'docpicker.UploaderSingle' );
dojo.require( 'docpicker.mustache._Templated' );
dojo.require( 'docpicker.EventEmitter' );

dojo.require( 'docpicker.Util' );

dojo.declare('docpicker.DocsDialog', [ dijit._Widget,dijit._Templated ], {
    templateString: dojo.cache( "docpicker.resources", "DocsDialog.html", {sanitize: true} ),
    widgetsInTemplate: true,
    token: null,
    upl: null,
    search: null,
    cssLinkElement: null,
    docStore: null,
    tempStore: null,
    html5Compatible: true,
    
    constructor: function( props ) {
        this.inherited( arguments );
        dojo.safeMixin( this, props );        
        
        this.docStore = dojo.store.Observable( new dojo.store.Memory( {} ) );
        this.docStore.query().observe( dojo.hitch( this, this.docStoreHandler ) );
        
        this.tempStore = new dojo.store.Memory( {});
        
        this.html5Compatible = this.hasFeatures();

        //prefetch images
        var closeModalImg = new Image();
        closeModalImg.src = dojo.moduleUrl( 'docpicker.resources.images' ).uri + 'closeModal.png';
        var trashImg = new Image();
        trashImg.src = dojo.moduleUrl( 'docpicker.resources.images' ).uri + 'trash.png';
        var docSpriteImg = new Image();
        docSpriteImg.src = dojo.moduleUrl( 'docpicker.resources.images' ).uri + 'googleIcons.png';
        var docBusyImg = new Image();
        docBusyImg.src = dojo.moduleUrl( 'docpicker.resources.images' ).uri + 'ajax-loader.gif';

        this.baseClass = 'PickerSpace';
        this.type = 'docpicker';        
        
        this.messageHandler();        

    },
    
    postCreate: function() {
        var self = this;
        this.inherited( arguments );
       
        dojo.removeClass( self.pickerContainer, 'pickerInvisible' );        
    },
    
    show: function() {                       
        var self = this;

        this.token = docpicker.Util.getUrlParameter( window.location, 'token' ) || null;
        this.messageUrl = docpicker.Util.getUrlParameter( window.location, 'messageUrl' ) || null;

        //console.log( this.token );
        
        if( self.html5Compatible ) {
            this.upl = new docpicker.Uploader( {
                target: dojo.byId( 'dropTarget' ),
                url: dojo.replace( '{0}/api/upload?&token={1}', [ docpicker.Util.serviceRoot(), this.token ]),
                displayTarget: this.displayTarget,
                tempStore: this.tempStore,
                token: this.token,
                pickerEmitter: self.pickerEmitter
            } );     
            
            dojo.connect( this.uploader.inputNode, 'onchange', this, function( evt ) {
                self.uploadFiles();
            } );    

        }
        else {
            this.uplSingle = new docpicker.UploaderSingle( {
                tempStore: this.tempStore,
                pickerEmitter: self.pickerEmitter,
                token: this.token,
                form: dojo.byId( "frmIO" )
            } );
            
            dojo.empty( dojo.byId( 'pickerIeFileInfo' ) );
            
            dojo.connect( this.iEuploader.inputNode, 'onchange', function( evt ) {
                var filename = self.iEuploader.getFileList()[0].name;
                dojo.byId( 'pickerIeFileInfo' ).innerHTML = 'Selected file: ' + filename;
            } );    

            dojo.connect( dojo.byId( "frmIO" ), 'onsubmit', function( evt ) {
                console.log( self.uplSingle );
                dojo.stopEvent( evt );
                var filename = self.iEuploader.getFileList()[0].name;
                self.uplSingle.uploadSingleFile( filename );
            } );    
        }
        
        dojo.connect( this.pickerDocsLink, 'onclick', function() {
            self.showDocs();
        });     
        
        dojo.connect( this.pickerUploadLink, 'onclick', function() {
            self.showUpload();
        });
        
        dojo.connect( this.closeDialogX, 'onclick', function( evt ) {
            dojo.stopEvent( evt );
            self.hide();
        });

        dojo.connect( this.pickerCancelLink, 'onclick', function( evt ) {
            dojo.stopEvent( evt );
            self.hide();
        });
        
        //ESC key closes everything
        dojo.connect( this, 'onKeyUp', function( evt ) {
            if( evt.keyCode == 27 ) {                
                dojo.stopEvent( evt );
                self.destroy();
            }
            return;
        });
        
        //emits events to the calling environment
        dojo.connect( this.pickerAddButton, 'onClick', function() {
            self.pickerEmitter.emit( 'selected', self.tempStore.query( null )  );
            self.hide()
        });
    
        dojo.style( this.domNode,'display','block' );
                                              
        window.parent.postMessage( dojo.toJson({ event: 'load' } ), this.messageUrl || 'http://' + window.location.host );
    },

    showDocs: function() {
        var self = this;
        
        dojo.removeClass( self.pickerUploadHTML5, 'pickerVisibleDisplay' );
        dojo.addClass( self.pickerUploadHTML5, 'pickerInvisibleDisplay' );
        dojo.addClass( self.pickerChooseDoc, 'pickerVisibleDisplay' );
    
        dojo.addClass( self.pickerDocsLink, 'pickerDocsLink' );
        dojo.removeClass( self.pickerDocsLink, 'pickerUploadLink' );
        dojo.addClass( self.pickerUploadLink, 'pickerUploadLink' );
        dojo.removeClass( self.pickerUploadLink, 'pickerDocsLink' );        
    },
    
    showUpload: function() {
        var self = this;

        dojo.addClass( self.pickerChooseDoc, 'pickerInvisibleDisplay' );
        dojo.addClass( self.pickerUploadHTML5, 'pickerVisibleDisplay' );
        dojo.removeClass( self.pickerChooseDoc, 'pickerVisibleDisplay' );
        if ( self.html5Compatible ) {
            dojo.removeClass( self.pickerDocsLink, 'pickerDocsLink' );
            dojo.addClass( self.pickerDocsLink, 'pickerUploadLink' );
            dojo.removeClass( self.pickerUploadLink, 'pickerUploadLink' );
            dojo.addClass( self.pickerUploadLink, 'pickerDocsLink' );
            dojo.addClass( dojo.byId( 'ieUpload' ), 'pickerInvisibleDisplay' );
        }
        else {
            dojo.addClass( dojo.byId( 'dropTarget' ), 'pickerInvisibleDisplay' );
        }
    },
    
    hide: function() {
        var self = this;
        var domNode = this.domNode;
        var height =  0 - ( dojo.marginBox( domNode ).h + 10 );
        
        this.getAnimation( height,dojo.hitch( this,function() {
            dojo.style( domNode, 'display', 'none' );
            self.pickerEmitter.emit( 'selected', []  );
            this.destroy();
        } ), 500 ).play();     
    },
    
    messageHandler: function() {
        var self = this;
        
        var messageCallback = function(e) {
            var data = dojo.fromJson( e.data );
            var origin = e.origin;
            
            if( data.event === "token" ){
                this.token = data.data;
            }
            if( data.event === "search" ){
                self.pickerAddButton.set( 'label', data.buttonTitle );
                self.search = new docpicker.SearchSelect( { 
                    docStore: self.docStore, 
                    docPane: self.docPane, 
                    tempStore: self.tempStore,
                    exclude: data.exclude,
                    token: self.token
                } );       
            }
        };
        
        //create the message listener
        if ( dojo.isIE < 9 ) {  
            window.attachEvent( 'onmessage', messageCallback );
        } 
        else {
            window.addEventListener( 'message', messageCallback, false );
        }  
        this.messageCallback = messageCallback;
    },
    
    docStoreHandler: function(object, removedFrom, insertedInto){
        var self = this;
        if(removedFrom > -1){ // existing object removed
            self.search.filter( null );
            dijit.byId('pickerSearchTextBox').set('value', '');
        }
        if(insertedInto > -1){ // new or updated object inserted
            self.search.filter( null );
            dijit.byId('pickerSearchTextBox').set('value', '');
        }
    },
        
    getAnimation: function( top, onEnd, duration) {
        this.currentAnimation = dojo.animateProperty( {
            node: this.domNode,
            properties: {
                top: top
            },
            duration: duration || this.animationDuration,
            onEnd: onEnd || function(){}
        } );
        return this.currentAnimation;
    },

    uploadFiles: function() {
        this.upl.addFiles( this.uploader.inputNode.files );
    },

    hasFeatures: function() {
        var supported;
        supported = this.hasDnDSupport();
        supported = this.hasFileAPISupport();
        supported = this.hasUploadSupport();
        return supported;
    },

    hasUploadSupport: function() {
        return 'withCredentials' in new XMLHttpRequest && 'upload' in new XMLHttpRequest;
    },

    hasFileAPISupport: function() {
        return typeof FileReader != 'undefined';
    },

    hasBlobSliceSupport: function(file) {
        // file.slice is not supported by FF3.6 and is prefixed in FF5 now
        return ( 'slice' in file || 'mozSlice' in file );
    },

    hasDnDSupport: function() {
        return 'draggable' in document.createElement( 'span' );
    },
    
    destroy: function() {
        this.inherited( arguments );
        
        if ( dojo.isIE < 9) {
            window.detachEvent("onmessage", this.messageCallback);
        }
        else {
            window.removeEventListener('message', this.messageCallback);
        }

        dojo.forEach( this._childWidgets, function( w ) { 
            w.destroyRecursive(); 
        });
        
    }    
   
});

(function(){
    var docsDialog;
    function showDialog( emitter ) {
        if( !dijit.byId('uploader') ) {
            docsDialog = new docpicker.DocsDialog( { pickerEmitter: emitter }, dojo.create('div', {}, dojo.body() ) );
            docsDialog.show();
        }        
    }
    function hideDialog() {
        if ( !googleDocsDialog ) return;
        docsDialog.hide();
    }
    
    //public methods
    docpicker.showDocsDialog = function( emitter ) {
        showDialog( emitter );
    }
    docpicker.hideDocsDialog = function() {
        hideDialog();
    }
    docpicker.startup = function() {
        this.cssLinkElement = dojo.create( 'link', { 
            type: "text/css", 
            rel:'stylesheet', 
            href: dojo.moduleUrl( 'docpicker.resources' ).uri + 'PickerSpace.css',
            'data-parent-id': this.id
        }, dojo.query( 'head' )[ 0 ] );
        return this.cssLinkElement;
    }
})();
