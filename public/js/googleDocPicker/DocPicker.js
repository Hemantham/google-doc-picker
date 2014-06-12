dojo.provide( 'googleDocPicker.DocPicker' );

dojo.require( 'googleDocPicker.EventEmitter' );
dojo.require( 'googleDocPicker.Util' );
dojo.require( 'dojo.window' );

dojo.declare( 'googleDocPicker.DocPicker', null, {
    iframeContainer: null,
    iframe: null,
    eventEmitter: null,
    token: null,
    iframeSrc: null,
    iframe: null,
    cssLinkElement: null,
    
    constructor: function() {
        this.inherited( arguments );
 
        this.animationDuration = 300;
        this.eventEmitter = new EventEmitter();
    },
    
    postCreate: function() {
    },
    
    load: function( props ) {
        dojo.safeMixin( this, props );       
        var self = this;
        this.iframeSrc = googleDocPicker.Util.serviceRoot() || window.location.protocol + "//" + window.location.host;
        this.iframeHost = window.location.protocol + "//" + window.location.host;

        if(!this.token)
            this.token = googleDocPicker.Util.getUrlParameter( window.location, 'token' );
        
        if( dojo.byId( 'pickerIFrameContainer' ) ) return;
        
        if( typeof( this.iframe ) === 'object' ) dojo.destroy( this.iframe );       
        if( typeof( this.iframeContainer ) === 'object' ) dojo.destroy( this.iframeContainer );

        console.log( this.token );
                  
        this.iframe = dojo.create( "iframe", {
            src: dojo.replace("{0}/docpicker.html?token={1}&messageUrl={2}", 
                [ googleDocPicker.Util.serviceRoot(),this.token, this.iframeHost ]),
            id: "pickerIFrame",
            allowTransparency: "true",
            height: 0,
            width: 0,
            frameBorder: 0,
            marginwidth: 0,
            marginheight: 0,        
            scrolling: 'no',
            tabIndex: -1,
            style: {
                height: "525px",
                width: "625px",
                overflow: "hidden",
                border: "none"
            }
        }, null, 'only' );
                
        this.iframeContainer = dojo.create('p', {
            id: "pickerIFrameContainer"
        } );
        
        self.showSpinner();
        dojo.body().appendChild( this.iframeContainer ); 
        this.iframeContainer.appendChild( this.iframe ); 

        this.messageHandler();                
    },
    
    on: function ( event, callback ) {
        switch ( event ) {
            //not handling any errors at the moment
            case ( 'error' ): {
                this.eventEmitter.addListener( 'error', function( data ) {
                    callback( data );
                });
                break;
            }
            case ( 'close' ): {
                this.eventEmitter.addListener( 'close', function( data ) {
                    callback( data );
                });
                break;
            }
        }        
    },
    
    setSearch: function( list, title) {
        //send doc exclude list and add button title text via message...
        this.iframe.contentWindow.postMessage( dojo.toJson( { event: "search", exclude: list, buttonTitle: title } ), this.iframeSrc);
    },
    
    setToken: function( token ) {
        this.iframe.contentWindow.postMessage( dojo.toJson( { event: "token", data: token } ), this.iframeSrc );
    },
    
    messageHandler: function() {
        var self = this;
        
        var messageCallback = function(e) {
            var data = dojo.fromJson( e.data );
            var origin = e.origin;
            
            if( data.event === "close" ){
                self.eventEmitter.emit( 'close', data.data  );
            }
            if( data.event === "load" ){
                self.positionPicker();
                self.hideSpinner();
                self.setSearch(self.exclude, self.addButtonTitle);
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

    getAnimation: function(top,onEnd,duration) {
        var self = this,
            box = dojo.window.getBox();

        this.currentAnimation = dojo.animateProperty({
            node: self.iframeContainer,
            properties: {
                top: box.t + 50
            },
            duration: duration || this.animationDuration,
            onEnd: onEnd || function(){}
        });
        return this.currentAnimation;
    },    
    
    onScroll: function(val){
        this.positionPicker();
    },
    
    destroy: function() {
        this.inherited( arguments ); 
        if ( dojo.isIE < 9) 
            window.detachEvent("onmessage", this.messageCallback);
        else 
            window.removeEventListener('message', this.messageCallback, false);

        if(this.scroller) dojo.disconnect(this.scroller);
        this.scroller = null;
        dojo.destroy( this.iframe );
        dojo.destroy( this.iframeContainer );
        dojo.forEach( this._childWidgets, function( w ) { 
            w.destroyRecursive(); 
        });
    },

    showSpinner: function() {
        var box = dojo.window.getBox();
        this.spinner = dojo.create('div', {
            id: "pickerSpinner",
            innerHTML: '<img style="margin: 29px;" src="' + googleDocPicker.Util.serviceRoot() + '/js/googleDocPicker/resources/big-loader.gif"/>',
            style: {
                left: (box.w / 2 - 50) + 'px',
                top: box.t + 100 + 'px',
            }
        } );
        dojo.body().appendChild( this.spinner ); 
    },

    hideSpinner: function() {
        this.spinner && dojo.query(this.spinner).orphan();
    },

    positionPicker: function() {
        var top = dojo.window.getBox().t;

        if( dojo.isIE )
            dojo.style( this.iframeContainer, "top", top + 50 + "px" );
        else
            this.getAnimation(top, null, 20).play();
        
        this.scroller = this.scroller || dojo.connect(window, 'onscroll', this, 'onScroll');
    }

});