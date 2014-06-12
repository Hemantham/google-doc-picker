#!/bin/bash

. "`dirname $0`/always_included.sh"

if [ -f /etc/init/toolbar.conf ]
then
  echo "An existing $SERVICE_NAME installation was found, stopping..."
  trap "sudo stop $SERVICE_NAME" 0

  echo "Removing the existing Upstart service config file: /etc/init/$SERVICE_NAME.conf"
  sudo rm /etc/init/$SERVICE_NAME.conf
fi

if [ -d $project_dir/app ]
then
  echo "Removing $project_dir/app"
  sudo rm -rf $project_dir/app
fi

if [ -d $LOGGING_DIRECTORY ]
then
  echo "Cleaning up log directory $LOGGING_DIRECTORY"
  sudo rm -rf $LOGGING_DIRECTORY
fi

if [ -d /tmp/$SERVICE_NAME ]
then
  echo "Cleaning up tmp file descriptors directory /tmp/$SERVICE_NAME "
  sudo rm -rf /tmp/$SERVICE_NAME
fi

