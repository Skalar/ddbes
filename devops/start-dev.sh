#!/bin/ash

set -e

echo "Watching and compiling files with babel..."

cd $SRC_DIR

babel \
  --copy-files \
  --skip-initial-build \
  --ignore node_modules \
  --out-dir $COMPILED_DIR \
  --source-maps inline \
  --watch \
  . &

cd $COMPILED_DIR

nodemon \
  --delay 0.5 \
  --on-change-only \
  --quiet \
  --watch . \
  --ignore node_modules \
  --exec "devops/unit-tests.sh; eslint --color --ignore-pattern node_modules $SRC_DIR \
  " &

wait
