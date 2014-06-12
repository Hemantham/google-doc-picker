SERVICE_NAME=docpicker
SERVICE_DESCRIPTION="Google Doc Picker Service"
CONFIG=/opt/$SERVICE_NAME/config.js

NODE_VERSION=0.6.5
NPM_VERSION=1.0.106
PORT=8200
WORKERS=4
LOGGING_DIRECTORY=/var/log/$SERVICE_NAME

#
# The Google APPS KEY and SECRET matching the Google Apps Marketplace application
#
#GOOGLE_APPS_CLIENT_KEY=1050185146238.apps.googleusercontent.com
#GOOGLE_APPS_CLIENT_SECRET=8TZ2siOogcaYl3UnQJHLMRgI
GOOGLE_OAUTH1_CLIENT_KEY=1050185146238.apps.googleusercontent.com
GOOGLE_OAUTH1_CLIENT_SECRET=8TZ2siOogcaYl3UnQJHLMRgI
GOOGLE_OAUTH2_CLIENT_KEY=374574440745.apps.googleusercontent.com
GOOGLE_OAUTH2_CLIENT_SECRET=eErfMyNNa_8oKDu_XLrMCJd3
CHAMBER_ROOT_URL=http://localhost:8400
GOOGLE_ROOT_REFRESH_URL=https://accounts.google.com/o/oauth2/token

WHITTAKER_ROOT_URL=http://whittaker-campus.dmz.arch.ecollege.com:3001
WINDMILL_ROOT_URL=http://whittaker-campus.dmz.arch.ecollege.com:3002

