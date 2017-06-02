FROM node:7.10-alpine

RUN apk --no-cache add \
  # Yarn / Docker installation dependencies
  curl \
  tar

ENV packageName=ddbes

ENV \
  COMPILED_DIR=/$packageName/compiled \
  SRC_DIR=/$packageName/src

# Include node_modules/.bin in PATH for not having to prefix commands
ENV PATH=$PATH:/$packageName/node_modules/.bin

RUN mkdir -p \
  # Compiled files
  $COMPILED_DIR \

  # Source files
  $SRC_DIR

WORKDIR /$packageName

COPY package.json yarn.lock ./

RUN \
  yarn \
  && ln -s /$packageName/node_modules $SRC_DIR/node_modules \
  && ln -s /$packageName/node_modules $COMPILED_DIR/node_modules

WORKDIR $COMPILED_DIR

COPY . .

RUN babel \
  --copy-files \
  --quiet \
  --ignore node_modules \
  --out-dir $COMPILED_DIR \
  .

CMD start-dev.sh
