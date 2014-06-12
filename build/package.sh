#!/bin/sh

ORIG_DIR=`pwd`
echo "___.         .__.__       .___.__                "
echo "\_ |__  __ __|__|  |    __| _/|__| ____    ____  "
echo " | __ \|  |  \  |  |   / __ | |  |/    \  / ___\ "
echo " | \_\ \  |  /  |  |__/ /_/ | |  |   |  \/ /_/  >"
echo " |___  /____/|__|____/\____ | |__|___|  /\___  / "
echo "     \/                    \/         \//_____/  "
echo "             .__  .__        ___.                        __  .__               "
echo "  ____  ____ |  | |  | _____ \_ |__   ________________ _/  |_|__| ____   ____  "
echo "_/ ___\/  _ \|  | |  | \__  \ | __ \ /  _ \_  __ \__  \\   __\  |/  _ \ /    \ "
echo "\  \__(  <_> )  |_|  |__/ __ \| \_\ (  <_> )  | \// __ \|  | |  (  <_> )   |  \ "
echo " \___  >____/|____/____(____  /___  /\____/|__|  (____  /__| |__|\____/|___|  / "
echo "     \/                     \/    \/                  \/                    \/  "
echo ""

echo "cleaning up 1st..."
cd ..
rm -rf dist
rm -rf package

echo "Copying resources..."
mkdir -p dist/app/public
cp -R public/*.html public/email public/style public/images dist/app/public/
cp -Rp app.js config routes deploy docs lib package.json node_modules dist/app/

mv dist/app/deploy dist/deploy

VERSION=$1

# install all of the NPM dependencies locally into the dist folder, into node_modules
echo "Installing NPM dependencies"
cd dist/app
npm update

cd node_modules
find . -name ".bin" | xargs rm -rf

echo "calling Dojo build..."
cd $ORIG_DIR
./build.sh -v$VERSION

# aggressively cleanup unneeded files
rm -rf  ../dist/app/public/js/dojo ../dist/app/public/js/dijit ../dist/app/public/js/dojox ../dist/app/public/js/mustache 
cd ../dist/app/public/js/googledocpicker 

# Just to be safe, verify the directory exists
if [ -d "../dist/app/public/js/googledocpicker" ]; then
	cd ../dist/app/public/js/googledocpicker 
	ls | grep -v 'CollabSpace.*' | grep '.js' | xargs rm
fi

cd $ORIG_DIR
cd ../dist/app/public
mv test-built.html test.html

cd $ORIG_DIR

echo "You package has been delivered to /dist - congratulations!"

cd ../dist
mkdir -p ../package
cp -R deploy ../package/

cd app
tar -pczf ../../package/googledocpicker-v$VERSION.tar.gz *

echo "A tar package has been delivered to /package/googledocpicker-v$VERSION.tar.gz!"

cd $ORIG_DIR
