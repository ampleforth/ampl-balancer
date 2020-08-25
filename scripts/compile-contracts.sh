#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_DIR=$DIR/../
SOLVERSION=0.6.12

export OPENZEPPELIN_NON_INTERACTIVE=true

if [ "$SOLC_NIGHTLY" = true ]; then
  docker pull ethereum/solc:nightly
fi

rm -rf $PROJECT_DIR/build
mkdir -p $PROJECT_DIR/build/contracts

echo "-----Compiling smart-pools"
# TODO: update the evm and solc version config
# to what is used by the most recent version of the smart-pools project
cd $PROJECT_DIR/node_modules/configurable-rights-pool
npx oz compile --solc-version $SOLVERSION \
  --optimizer on --optimizer-runs 1 --evm-version istanbul

echo "-----Compiling UFragments contract"
cd $PROJECT_DIR/node_modules/uFragments
npx oz compile --solc-version 0.4.24

echo "-----Compiling project"
cd $PROJECT_DIR
npx oz compile --solc-version $SOLVERSION \
  --optimizer on --optimizer-runs 1 --evm-version istanbul
