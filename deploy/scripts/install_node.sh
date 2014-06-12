#!/bin/bash
. "`dirname $0`/vercomp.sh"

if [ -z "$1" -o -z "$2" ]; then	
  echo "usage: $0 <NODE_VERSION> <NPM_VERSION>"
  exit 1
fi

PREVPWD=`pwd`

N_NODE_VERSION="$1"
NPM_VERSION="$2"
MIN_NODE_VERSION="0.4.12"
CURRENT_NODE_VERSION=`node --version | sed 's/.\(.*\)/\1/'`
CURRENT_NPM_VERSION=`npm --version`

# install dependencies for getting and building node
sudo apt-get install g++ curl libssl-dev apache2-utils
sudo apt-get install git-core zip

# Use "n" to manage multiple versions of node. 
# https://github.com/visionmedia/n#readme
# However, node needs to be installed before npm and npm before n
# so if there's a really older version of node or node is not installed at all, install 
# the version specified in the NODE_VERSION parameter

# install node ################################################################
echo "Checking Node Version..."

vercomp $CURRENT_NODE_VERSION  $MIN_NODE_VERSION
if [ $? -eq 2 ]; then
  echo "installing node version $MIN_NODE_VERSION, current version is $CURRENT_NODE_VERSION"
  cd /opt

  if [ ! -d "/opt/node" ]; then
        git clone http://github.com/joyent/node.git   
  fi

  cd node
  git pull origin master
  git checkout v$NODE_VERSION
  make clean
  ./configure
  make 
  sudo make install
else
    echo "node is already installed. SKIPPING. Version is $CURRENT_NODE_VERSION"
fi

vercomp $CURRENT_NPM_VERSION $NPM_VERSION
if [ $? -eq 2 ]; then
  # install npm
  cd /opt

  if [ ! -d "/opt/npm" ]; then
    git clone http://github.com/isaacs/npm.git
  fi

  cd npm
  git pull origin master
  git checkout $NPM_VERSION
  sudo make install
  # done installing npm

else
  echo "NPM is already at or above the minimum version. Current: $CURRENT_NPM_VERSION Min: $NPM_VERSION" 
fi

cd $PREVPWD

# install n to manage multiple version of node for us
sudo npm install -g n
n $N_NODE_VERSION
