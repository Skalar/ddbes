FROM node:9.6.1-alpine

# Include node_modules/.bin in PATH for not having to prefix commands
ENV PATH=$PATH:/ddbes/node_modules/.bin

RUN mkdir /ddbes

WORKDIR /ddbes

COPY package.json yarn.lock ./

RUN yarn

COPY . .

CMD scripts/start-dev
