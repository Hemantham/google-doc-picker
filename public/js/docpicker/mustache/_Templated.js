dojo.provide("docpicker.mustache._Templated");

dojo.require("dijit._Templated");

// from: https://gist.github.com/474401
// INSTALL: copy http://github.com/janl/docpicker.mustache.js to this folder as _base.js
//  Add mustache = dojo.hitch(Mustache, "to_html") in _base.js, wrapping 
//  the whole file in a self-executing-anonymous-function. eg:
//
//  dojo.provide("docpicker.mustache._base");
//  (function(){ 
//      /* contents of docpicker.mustache.js */
//      // export to Dojo
//      mustache = dojo.hitch(Mustache, "to_html");
//  })();
//
dojo.require("docpicker.mustache._base");

dojo.declare("docpicker.mustache._Templated", dijit._Templated, {
    // prevent from reusing DOM nodes as template, we want to redraw
    _skipNodeCache:true,
    _stringRepl: function(template){
        // override the default/basic ${foo} substitution in _Templated 
        return dojo.trim(mustache(template, this)); // String
    }
});