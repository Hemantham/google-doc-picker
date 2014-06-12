test:
	./node_modules/nodeunit/bin/nodeunit test/*.js
	
install:
	npm install . && npm update
	
package: 
	cd build && ./package.sh
	
clean:
	rm -rf dist package public/dist
	
docs:
	./node_modules/.bin/docco-husky  -name "Google Doc Picker" *.js lib public/js
	
.PHONY: package test docs

