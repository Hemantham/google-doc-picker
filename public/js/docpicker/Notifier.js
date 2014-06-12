// Provide the class
dojo.provide('docpicker.Notifier');

// Get requirements
dojo.require('dijit._Widget');
dojo.require('dijit._Templated');

// Declare the class
dojo.declare('docpicker.Notifier', [dijit._Widget,dijit._Templated], {
	
	// Constructor
	constructor: function() {
		// Declare public class properties
		
		// showDuration: Number
		// 		The duration to show a message, in milliseconds
		this.showDuration = 5000;
		
		// animationDuration: Number
		// 		The duration to animate the notifier in and out
		this.animationDuration = 300;
		
		// templateString: String
		//      template that holds content
		this.templateString = dojo.cache('docpicker.resources', 'Notifier.html');
		//baseClass: String
		//      css class
        this.baseClass = 'PickerSpaceNotifier';
		this.type = 'notification';
	},
	
	// Shows the notifier
	show: function(showMilliseconds) {
		// summary: 
		// 		Brings the notifier into view
		
		// Show it!
		dojo.style(this.domNode,'display','block');
		
		// Animate the top property accordingly
		var top = window.pageYOffset > 0 ? window.pageYOffset : document.documentElement.scrollTop;
		this.getAnimation(top).play();
		// Interval
		if(this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = false;
		}
		this.timeout = setTimeout(dojo.hitch(this,this.hide),showMilliseconds || this.showDuration);
		
		// Scoller
		if(!this.scroller) {
			this.scroller = dojo.connect(window, 'onscroll', this, 'onScroll');
		}
		
	},
	
	hide: function() {
		// summary: 
		// 		Hides the notifier from view
		
		// Get my current height
		var domNode = this.domNode;
		var height =  0 - (dojo.marginBox(domNode).h + 10); // 10 for safety
		
		// Animate the top property accordingly
		this.getAnimation(height,dojo.hitch(this,function() {
			// Hide it!
			dojo.style(domNode,'display','none');
			if(this.scroller) {
				dojo.disconnect(this.scroller);
				this.scroller = false;
			}
		})).play();
		
	},

	onScroll: function(val){
		var top = window.pageYOffset > 0 ? window.pageYOffset : document.documentElement.scrollTop;
		if(this.timeout) {
			//dojo.style(this.domNode,'top',top + 'px');
			this.currentAnimation.stop(); // More elegant
			this.getAnimation(top,null,20).play(); // Does immediate topping
		}
	},
	
	postCreate: function() {
		// Keep func
		this.inherited(arguments);
		// Create hide connector
		this.connect(this.closeNode,'onclick',function(evt) {
			// Stop event
			dojo.stopEvent(evt);
			// Hide me
			this.hide();
		});
	},
	
	getAnimation: function(top,onEnd,duration) {
		// summary: 
		// 		Returns a dojo.fx animation, ready to be played
		// top: Number
		// 		The 'top' CSS property to transiton to
		this.currentAnimation = dojo.animateProperty({
			node: this.domNode,
			properties: {
				top: top + 10 // padded for 10 for the iframe wrapper
			},
			duration: duration || this.animationDuration,
			onEnd: onEnd || function(){}
		});
		return this.currentAnimation;
	},
	
	// Sets the notifier value
	_setValueAttr: function(value) {
		this.containerNode.innerHTML = value;
	},

	_setTypeAttr: function(type){
		dojo.removeClass(this.domNode, this.baseClass + this.type.charAt(0).toUpperCase() + this.type.slice(1));
		this.type = type;
		dojo.addClass(this.domNode, this.baseClass + type.charAt(0).toUpperCase() + type.slice(1));
	}
});

// Creates one notifier for this page -- this can be used by all widgets
(function(){
	var notifier;
	function showNotifier(type, message){
		if(!notifier){
			notifier = new docpicker.Notifier({}, dojo.create('div', {}, dojo.body()));
		}
		notifier.set('type', type);
		notifier.set('value', message);
		notifier.show();
	}
	function hideNotifier(){
		if (!notifier)
			return;
		notifier.hide();
	}
	docpicker.notify = function(message){
		if (message)
			showNotifier('notification', message);
		else
			hideNotifier();
	};
	docpicker.error = function(message){
		showNotifier('error', message);
	};
})();
