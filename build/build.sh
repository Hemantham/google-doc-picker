#!/bin/bash
# temporary build script for now as a shell script, should probably use something cross platform... eventually
ORIG_DIR=`pwd`

# set the REALEASE_DIR because it can't contain .. in the path
#    as described here http://blog.nicocrm.com/2010/12/05/misadventures-with-the-dojo-build-system/
mkdir -p ../dist/app/public/js
cd ../dist/app/public/js
RELEASE_DIR=`pwd`
cd $ORIG_DIR

#cd ../js/dojo/util/buildscripts
cd ../node_modules/eclg-dojo/dojo/1.6.1/dojo/util/buildscripts

# add cssOptimize=comments to end of next line for CSS compression, might be best just to GZIP this though
./build.sh profileFile=$ORIG_DIR/docpicker.profile.js version=$1 loader=xdomain action=release releaseDir=$RELEASE_DIR releaseName=.
cd $ORIG_DIR