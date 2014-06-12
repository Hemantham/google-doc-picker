#!/bin/bash
. "`dirname $0`/always_included.sh"

if [ -f /etc/init/$SERVICE_NAME.conf ]; then
	trap "sudo stop $SERVICE_NAME" 0
fi

ORIG_DIR=`pwd`

cd `dirname $0`
cd ../..
ROOT_DIR=`pwd`

cd $ROOT_DIR
sudo ./deploy/scripts/install_node.sh $NODE_VERSION $NPM_VERSION
sudo ./deploy/scripts/setup.sh
sudo ./deploy/scripts/config.sh
