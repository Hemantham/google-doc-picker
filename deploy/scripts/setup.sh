#!/bin/bash

# TODO check if node exists, else error
if [ -z "`which node`" ]; then
	echo "node is not on the path!!!! BYE :("
	exit 1
fi

if [ -z "`which npm`" ]; then
	echo "npm is not on the path!!!! BYE :("
	exit 1
fi

. "`dirname $0`/always_included.sh"

run_template "$project_dir/deploy/templates/upstart.conf.template" "/etc/init/$SERVICE_NAME.conf"

PREVPWD=`pwd`

# unpack the zip
VERSION=`cat $project_dir/VERSION`
unzip -q -d $project_dir $project_dir/$SERVICE_NAME-$VERSION.zip
#rm $project_dir/$SERVICE_NAME-$VERSION.zip
 
cd $PREVPWD

sudo mkdir -vp "$LOGGING_DIRECTORY"