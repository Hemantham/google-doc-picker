#!/bin/bash
. "`dirname $0`/always_included.sh"
run_template "$project_dir/deploy/templates/config.js.template" "$CONFIG"
