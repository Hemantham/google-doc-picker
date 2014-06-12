dojo.provide( 'docpicker.SearchSelect' );

dojo.require( 'dijit._Widget' );
dojo.require( 'dijit._Templated' );
dojo.require( 'dojo.date.locale' );
dojo.require( 'dijit.layout.ContentPane' );
dojo.require( 'docpicker.Util' );
dojo.require( 'docpicker.Notifier');

dojo.declare('docpicker.SearchSelect', [ dijit._Widget,dijit._Templated ], {
    templateString: dojo.cache("docpicker.resources", "SearchSelect.html", {sanitize: true} ),
    widgetsInTemplate: true,
    token: null,
    resultContainer: null,
    searchTextbox: null,
    searchButton: null,
    searchStr: null,
    excludeStore: null,
    
    constructor: function( props ) {
        this.inherited( arguments );
        dojo.safeMixin( this, props ); 
    },
    
    postCreate: function() {
        var self = this;
        self.inherited( arguments );
        self.searchTextbox = dijit.byId('pickerSearchTextBox');
        self.searchButton = dijit.byId( 'pickerSearchButton' );

        this.resultContainer = dojo.query( '.pickerSearchResult', self.pickerChooseDoc)[0]
        dojo.place(self.pickerDocPane, self.resultContainer, 'append' );
        
        //filter as you type
        dojo.connect( self.searchTextbox, 'onKeyUp', function( e ) {
            self.filter( self.searchTextbox.get( 'value' ) );
        });

        dojo.connect( self.searchButton, 'onClick', function( e ) {
            self.searchStr = self.searchTextbox.get( 'value' );
            self.load();
        });
        
        dojo.connect(self.searchTextbox, 'onKeyPress', function (evt) {
            if( evt.keyCode == dojo.keys.ENTER ) {
                self.searchStr = self.searchTextbox.get( 'value' );
                self.load();
            }
            return;
        });  
      
        this.load();
        self.searchTextbox.set('disabled', true);
        self.searchButton.set('disable', true);
    },
    
    load: function() {
        var self = this;        
        var excludedDocs = [];

        self.clearResults();
        self.showSpinner();
               
        var args = {
            url: dojo.replace( '{0}/api/docs?search={1}&token={2}', 
                    [ docpicker.Util.serviceRoot(), encodeURIComponent( this.searchStr ), this.token ]),
            callbackParamName: 'callback',
            preventCache: true,
            handleAs: 'json',
            headers: { 
                'Content-Type': 'application/json'
            },             
            load: function( data ) {

                self.focusTextbox();
                
                if( data.status != 'success' ) {
                    self.showFailedToLoad('Failed to load search results');
                }
                else {
                    var docs = data.data.items;
                    self.hideSpinner();
                    
                    if( docs.length < 1 ) {
                        return self.showNoDocs();
                    }
                    
                    var excludeArr = {};
                    
                    dojo.forEach( self.exclude, function( exclude, i ) {
                        excludeArr[ exclude.id ] = i;
                    });
                    
                    var dateObj = new Date();
                    var firstData = true;
                                       
                    var accum = [];
                    dojo.forEach( docs, function( doc, i ) {
                        if( !(doc.id in excludeArr) ) {
                            doc.datetime = docpicker.Util.formatDate( doc.updated, dateObj );
                            doc.last = ( i == ( docs.length - 1 ) ) ? 'pickerLastDocPane' : '';
                            doc.icon = docpicker.Util.getDocIcon( doc.title );
                            doc.selected = false;
                            doc.name = i + 100;
                            accum.push( mustache( self.googleDocTemplate.innerHTML, doc ) );
                            firstData = false;
                            excludedDocs.push( doc );
                        }
                    });

                    self.pickerDocsResult.innerHTML = accum.join('');

                    
                    self.docStore.data = docs;
                    dojo.forEach( self.exclude, function( exclude, i ) {
                        self.docStore.remove( { id: exclude.id } );
                    });
                    self.connectDocEvents( excludedDocs );

                }
            },
            error: function( error ) {
                self.showFailedToLoad('Failed to load search results');
                self.focusTextbox();
            }
        };
        if( docpicker.Util.hasCors() ) {
            dojo.xhrGet( args );
        } else {
            args.content = {
                _body: args.postData,
                _method: 'GET'
            }
            dojo.io.script.get( args );              
        }

    },
    
    filter: function( queryStr ) {
        var self = this;

        queryStr = queryStr || "";
        
        // strip out * characters from the fileter
        queryStr = queryStr.replace(new RegExp('\\*', 'g'), '');
        
       // console.log( "sort? " + sortBool );
        //always sort desc by updated field
        var sort = { sort:[ {   ibute:'updated', descending: true } ] };
        
        var filtered = !queryStr ? 
            self.docStore.query( null ) : 
            self.docStore.query( function( object ){
                return ( object.title.toLowerCase() ).indexOf( queryStr.toLowerCase() ) != -1;
            }, sort);
        
        if( filtered.length < 1 ) {
            self.showNoDocs();
        }
        
        var dateObj = new Date();
        var accum = [];
        dojo.query('.pickerDocPane', self.pickerDocPane).addClass('hidden');
        dojo.forEach( filtered, function( doc, i ) {  
            doc.datetime = docpicker.Util.formatDate( doc.updated, dateObj );
            doc.last = ( i == ( filtered.length - 1 ) ) ? 'pickerLastDocPane' : '';
            doc.icon = docpicker.Util.getDocIcon( doc.title );
            doc.selected = false;
            doc.name = i + 100;
            accum.push(mustache( self.googleDocTemplate.innerHTML, doc ));   
        });

        self.pickerDocsResult.innerHTML = accum.join('');
        
        this.connectDocEvents( filtered );        
    },

    connectDocEvents: function( docs ) {
        var self = this;
        var divName = 100;
        var node = dojo.query( '.[ name $= ' + divName + ' ]' )[0];

        dojo.connect( dojo.byId( 'pickerSearchResult' ), 'onfocus', function() {
            divName = ( Number( 100 ) + Number( dojo.byId( 'pickerSearchResult' ).scrollTop / 36) ).toFixed(0);
            node = dojo.query('[ name $= ' + divName + ' ]')[0];
            dojo.query('.pickerDocPane').removeClass( 'pickerDocPaneScroll' );
            if( typeof( dojo.byId( node.id ) ) !== 'undefined' )
                dojo.addClass( dojo.byId( node.id ), 'pickerDocPaneScroll' );
        });   
        
        if ( dojo.isIE < 9 ) { 
            dojo.connect( document, 'onkeydown', function( e ) {
                if( document.activeElement.id == 'pickerSearchResult' ) {
                    if ( e.ctrlKey && e.keyCode==32) {
                        e.charCode = 32;
                        handleSpaceKey( e );
                    }
                }
            });
            
            dojo.connect( document, 'onkeyup', function( e ) {
                if( document.activeElement.id == 'pickerSearchResult' ) {
                    dojo.stopEvent( e );
                    switch ( e.keyCode ) {
                    case 13:
                        handleEnter();
                        break;
                    case 32:
                        e.charCode = 32;
                        handleSpaceKey( e );
                        break;
                    case 39:
                        e.charCode = 32;
                        handleSpaceKey( e );
                        break;
                    case 40:
                        e.charCode = 40;
                        handleDownArrow( e );
                        break;
                    case 38:
                        e.charCode = 38;
                        handleUpArrow( e );
                        break;
                    }
                }
            });
        }
        else {

            dojo.connect( this.pickerDocResult, 'onkeypress', function( e ) {
                if( document.activeElement.id == 'pickerSearchResult' ) {
                    handleSpaceKey( e );
                }
            });
            
            dojo.connect( this.pickerDocResult, 'onkeyup', function( e ) {
                if( document.activeElement.id == 'pickerSearchResult' ) {
                    switch (e.keyCode) {
                    case dojo.keys.UP_ARROW:
                        handleUpArrow( e );
                        break;
                    case dojo.keys.DOWN_ARROW:
                        handleDownArrow( e );
                        break;
                    case dojo.keys.ENTER:
                        handleEnter( e );
                        break;
                    }
                }
            });
        }
        
        function handleSpaceKey ( e ){
            if( e.charCode == 32 || e.charCode == 39 || e.keyCode == 39) {
                dojo.stopEvent( e );
                if( dojo.byId( node.id ).value == 'selected' ) {
                    dojo.removeClass( dojo.byId( node.id ), 'pickerDocSelected' );
                    dojo.removeClass( dojo.byId( node.id ), 'pickerDocPaneNoHover' );                    
                    dojo.addClass( dojo.byId( node.id ), 'pickerDocPane' );                    
                    dojo.byId( node.id ).value = undefined;
                    self.tempStore.remove( node.id );
                }
                else {
                    dojo.addClass( dojo.byId( node.id ), 'pickerDocSelected' );
                    dojo.addClass( dojo.byId( node.id ), 'pickerDocPaneNoHover' );                    
                    dojo.removeClass( dojo.byId( node.id ), 'pickerDocPane' );                    
                    dojo.byId( node.id ).value = 'selected';
                    var doc = self.docStore.query( {id: node.id } );
                    self.tempStore.put( doc[0] );
                }
            }
        }
        
        function handleDownArrow( e ) {
//            console.log( "UP_ARROW" )
            divName = ( Number( 101 ) + Number (dojo.byId( 'pickerSearchResult' ).scrollTop / 36) ).toFixed(0);
            node = dojo.query('[ name $= ' + divName + ' ]')[0];
            dojo.query('.pickerDocPane').removeClass( 'pickerDocPaneScroll' );
            dojo.addClass( dojo.byId( node.id ), 'pickerDocPaneScroll');
        } 
        
        function handleUpArrow( e ) {
//            console.log( "UP_ARROW" )
            divName = ( Number( 100 ) + Number (dojo.byId( 'pickerSearchResult' ).scrollTop / 36) ).toFixed(0);
            node = dojo.query('[ name $= ' + divName + ' ]')[0];
            dojo.query('.pickerDocPane').removeClass( 'pickerDocPaneScroll' );
            if( typeof( dojo.byId( node.id ) ) !== 'undefined' )
                dojo.addClass( dojo.byId( node.id ), 'pickerDocPaneScroll');
        }       

        function handleEnter() {
            dijit.byId( 'pickerAddButton' ).onClick();
        }
        
        dojo.forEach( docs, function( doc, i ) {    
            dojo.connect( dojo.byId( doc.id ), 'onclick', function() {
                if( dojo.byId( doc.id ).value == 'selected' ) {
                    dojo.removeClass( dojo.byId( doc.id ), 'pickerDocSelected' );
                    dojo.removeClass( dojo.byId( doc.id ), 'pickerDocPaneNoHover' );                    
                    dojo.addClass( dojo.byId( doc.id ), 'pickerDocPane' );                    
                    dojo.byId( doc.id ).value = undefined;
                    self.tempStore.remove( doc.id );
                }
                else {
                    dojo.addClass( dojo.byId( doc.id ), 'pickerDocSelected' );
                    dojo.addClass( dojo.byId( doc.id ), 'pickerDocPaneNoHover' );                    
                    dojo.removeClass( dojo.byId( doc.id ), 'pickerDocPane' );                    
                    dojo.byId( doc.id ).value = 'selected';
                    //console.debug( doc );
                    self.tempStore.put( doc );
                }
            });
            dojo.connect( dojo.byId( doc.id ), 'mouseover', function() {
                dojo.query('.pickerDocPane').removeClass( 'pickerDocPaneScroll' );
            });
        });
    },

    showFailedToLoad: function(message) {
        docpicker.error(message);
        this.hideSpinner();
    },

    hideSpinner: function() {
        dojo.style(this.pickerDocsLoading, 'display', 'none');
    },
    
    showSpinner: function() {
        dojo.style(this.pickerDocsLoading, 'display', 'inherit');
    },

    clearResults: function() {
        this.pickerDocsResult.innerHTML = '';
    },

    focusTextbox: function() {
        var self = this;
        if(self.searchTextbox) {
            self.searchTextbox.set('disabled', false);
            self.searchTextbox.focus();
        }
        if (self.searchButton) 
            self.searchButton.set('disabled', false);
    },

    showNoDocs: function() {
        var noDocs = dojo.create( 'div', { innerHTML: 'No Docs Found.' }, this.pickerDocsResult, 'only' );
        dojo.addClass( noDocs, 'pickerNoDocs');
    },
    
    destroy: function() {
        this.inherited( arguments );
        dojo.forEach( this._childWidgets, function( w ) { 
            w.destroyRecursive(); 
        });
    }    

});