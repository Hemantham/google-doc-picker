#!/bin/bash

# resolve links - $0 may be a softlink
scriptname="$0"
while [ -h "$scriptname" ]; do
  ls=`ls -ld "$scriptname"`
  link=`expr "$ls" : '.*-> \(.*\)$'`
  if expr "$link" : '/.*' > /dev/null; then
    scriptname="$link"
  else
    scriptname=`dirname "$scriptname"`/"$link"
  fi
done

# Get standard environment variables
scriptdir=`dirname "$scriptname"`
scriptdir=`cd "${scriptdir}";pwd` # get absolute path

tmpscriptdirbase=`basename "$scriptdir"`
if [ "$tmpscriptdirbase" = "sbin" ]; then
        scriptdir="$scriptdir/../deploy/scripts"
fi

project_dir=`cd "${scriptdir}/../..";pwd`

envdir=`cd "${scriptdir}/../environmental";pwd`

if [ -e "${envdir}/EnvVars.sh" ]; then
	. "${envdir}/EnvVars.sh"
fi
#gives chance to overwrite or set values per machine
machineName=`hostname -f`
if [ -e "${envdir}/${machineName:-NoMachineNameSet123}-vars.sh" ]; then  #if machine is not set use something random so will not find file but will not fail if nounset is set.
   . "${envdir}/${machineName}-vars.sh"
fi

#sbindir=`cd "${whittakerdir}/sbin";pwd`
#libdir=`cd "${whittakerdir}/lib";pwd`
#configdir="${whittakerdir}/config"

#CONFIG_PATH="${configdir}/$CONFIG_FILENAME"


run_template()
{
  infile=$1
  outfile=$2

  echo "$(eval "echo \"$(cat $infile | awk '{ gsub("\"", "\\\\\""); print }' )\"")" > "$outfile.tmp"
  cat "$outfile.tmp" | sed 's/\\/"/g' > "$outfile" && rm "$outfile.tmp"
  echo "Generated $outfile from template $infile."
}

