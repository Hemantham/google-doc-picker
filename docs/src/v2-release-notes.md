Google Doc Picker Deployment Instructions
============================

The Google Doc Picker is a service and a UI widget included at runtime for selecting existing Google Docs and/or uploading new files to Google Docs through multi-file upload or drag and drop

The source for the Google Doc Picker is managed at [Github](http://github.com) in this [repo](https://github.com/PearsonEducation/google-doc-picker). It's build and tested continually with each <code>git push</code> by [Jenkins](http://polly.petdev.com:8080/view/Google%20Projects/job/google-doc-picker/).

### Perforce

Each deployment is packaged and synced to Perforce.

    //system/dev/ei-berlin/docpicker

### Config Notes

1. Delete these config keys: GOOGLE_APPS_CLIENT_KEY, GOOGLE_APPS_CLIENT_SECRET

2. Update Node Version to 0.6.12 and NPM Version to 1.1.12

3. New Config values

### Configuration (PQA)

    Delete these config keys: GOOGLE_APPS_CLIENT_KEY, GOOGLE_APPS_CLIENT_SECRET

    ----------------------------------- NEW CONFIG -----------------------------------------------------
    #
    # The Google APPS KEY and SECRET matching the Google Apps Marketplace application
    #
    GOOGLE_OAUTH1_CLIENT_KEY=1050185146238.apps.googleusercontent.com
    GOOGLE_OAUTH1_CLIENT_SECRET=8TZ2siOogcaYl3UnQJHLMRgI
    GOOGLE_OAUTH2_CLIENT_KEY=374574440745.apps.googleusercontent.com
    GOOGLE_OAUTH2_CLIENT_SECRET=eErfMyNNa_8oKDu_XLrMCJd3
    CHAMBER_ROOT_URL=<chamber_url_in_pqa>

    GOOGLE_ROOT_REFRESH_URL=https://accounts.google.com/o/oauth2/token
    ------------------------------------------------------------------------------------------------------

### Configuration (PQA)

    Delete these config keys: GOOGLE_APPS_CLIENT_KEY, GOOGLE_APPS_CLIENT_SECRETca

    ----------------------------------- NEW CONFIG -----------------------------------------------------
    #
    # The Google APPS KEY and SECRET matching the Google Apps Marketplace application
    #
    GOOGLE_OAUTH1_CLIENT_KEY=1050185146238.apps.googleusercontent.com
    GOOGLE_OAUTH1_CLIENT_SECRET=8TZ2siOogcaYl3UnQJHLMRgI
    GOOGLE_OAUTH2_CLIENT_KEY=374574440745.apps.googleusercontent.com
    GOOGLE_OAUTH2_CLIENT_SECRET=eErfMyNNa_8oKDu_XLrMCJd3
    CHAMBER_ROOT_URL=<chamber_url_in_prod>

    GOOGLE_ROOT_REFRESH_URL=https://accounts.google.com/o/oauth2/token
    ------------------------------------------------------------------------------------------------------

### Deployment

1. Sync from Perforce <code>//system/dev/ei-berlin/docpicker</code> to <code>/opt/docpicker</code>

2. Execute the install script: 

        sudo /opt/docpicker/deploy/scripts/vm_install.sh

3. Confirm that the file /opt/docpicker/config.js exists and looks sane

4. Start the docpicker service:

        sudo start docpicker

5. Ensure it is running by running this <code>curl</code> command and checking that some HTML is returned:

        curl http://localhost:8200/test.html

6. Also test in the browser with this address: <code>http://host:8200/test.html</code>. You should see a <code>+ Load Google Docs Picker</code> link. Click this and the picker should load but show an error that it failed to load the search results.

### Administration

* Start the service: <code>service start docpicker</code>

* Stop the service: <code>service stop docpicker</code>

* Reapplying <code>EnvVars.sh</code> changes: <code>/opt/docpicker/deploy/scripts/config.sh</code>

### Deployment Packaging

    docpicker-<git_sha_prefix>.zip
    deploy/
        environmental/
            EnvVars.sh (typically synced from Perforce)
        scripts/
            vm_install.sh
            config.sh (rerun injection of EnvVars.sh to config.js)
            ...
        templates/
            config.js.template
            upstart.conf.template
    STAMP
    VERSION

STAMP will contain the build details, for example:

    Built by Mike Brevoort at Sun Dec 18 18:49:16 MST 2011 on Michael-Brevoorts-MacBook-Pro.local with git version 89b2b01b68cd3bb88d162d85b27df6f02f7e8f81

