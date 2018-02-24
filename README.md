# ddbes

DynamoDB Event Store

## WARNING

You should probably not be using this unless you are familiar with event sourcing and willing to read and understand the code.

## Table of contents

* [Features](#features)
* [Installation](#installation)
* [Usage](https://github.com/Skalar/ddbes/wiki)
* [API docs](#api-docs)
* [Development](#development)

## Features

* Modern and convenient interface for using DynamoDB as an event store
* S3 snapshots (for aggregates with many commits)
* Upcasters and lazy transformation
* WebSocket server and client for event subscriptions (e.g. for providing graphql subscriptions)
* Helpers for managing dynamodb tables (incl. auto scaling)
* Efficient store querying and mutation

## Installation

```shell
yarn add ddbes
```

A minimum of node 6.5.0 is required. If used with >=9.0.0 and --harmony, the non-transpiled version with native async generators etc is used.

## API docs

_TODO_

## Development

### Starting development environment

```shell
# Bring up a local dynamodb and s3, as well as running tests and linting every time the code changes.

docker-compose up --build
```

### Running tests across all node targets

```shell
# Assumes the development environment is running

docker-compose exec dev yarn test
```

### Publishing new version

```shell
# Assumes the development environment is running

docker-compose exec dev scripts/publish
```
