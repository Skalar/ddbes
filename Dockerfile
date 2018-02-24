FROM trym/watchexec-alpine as watchexec
FROM node:6.13.0-alpine
FROM node:9.6.1-alpine

COPY --from=watchexec /bin/watchexec /bin
COPY --from=node:6.13.0-alpine /usr/local /usr/local-6.13.0
RUN ln -s /usr/local /usr/local-9.0.0

RUN apk -U add bash git rsync

# Include node_modules/.bin in PATH for not having to prefix commands
ENV PATH=$PATH:/ddbes/node_modules/.bin

RUN mkdir /ddbes /transpiled

WORKDIR /ddbes

COPY package.json yarn.lock ./

RUN yarn

COPY . .

CMD scripts/start-dev
