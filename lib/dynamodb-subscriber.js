/* eslint-disable */

"use strict";

const aws = require('aws-sdk');
const EventEmitter = require('events').EventEmitter;
const schedule = require('tempus-fugit').schedule;
const ms = require('ms');
const async = require('async');

class DynamodDBSubscriber extends EventEmitter {
  constructor (params) {
    super();

    if (!params.arn && !params.table) {
      throw new Error('arn or table are required');
    }

    this._table = params.table;
    this._streamArn = params.arn;

    if (typeof params.interval === 'number') {
      this._interval = params.interval;
    } else if (typeof params.interval === 'string') {
      this._interval = ms(params.interval);
    } else {
      this._interval = ms('10s');
    }
    this.aws = params.aws || aws
    this._ddbStream = new this.aws.DynamoDBStreams();
  }

  _getOpenShards (callback) {
    var LastEvaluatedShardId;
    const shards = [];
    async.doWhilst(
      (cb) => {
        this._ddbStream.describeStream({
          StreamArn: this._streamArn,
          ExclusiveStartShardId: LastEvaluatedShardId
        }, (err, data) => {
          if (err) {
            return console.log(err);
          }
          LastEvaluatedShardId = data.StreamDescription.LastEvaluatedShardId;

          //filter closed shards.
          const openShards = data.StreamDescription.Shards
                  .filter(s => !s.SequenceNumberRange.EndingSequenceNumber);

          async.map(openShards, (shard, cb) => {

           this._ddbStream.getShardIterator({
              StreamArn: this._streamArn,
              ShardId: shard.ShardId,
              ShardIteratorType: 'LATEST'
            }, (err, data) => {
              if (err) { return cb(err); }
              shard.iterator = data.ShardIterator;
              cb(null, shard);
            });

          }, (err, shardsWithIterators) => {
            if (err) { return cb(err); }
            shardsWithIterators.forEach(s => shards.push(s));
            cb();
          });
        });
      },
      () => LastEvaluatedShardId,
      (err) =>  {
        if (err) {
          return callback(err);
        }
        callback(null, shards);
      }
    );
  }

  _process (job) {
    async.each(this._shards, (shard, callback) => {
      this._ddbStream.getRecords({ ShardIterator: shard.iterator }, (err, data) => {
        if (err) {
          return callback(err);
        }
        if (data.Records && data.Records.length > 0) {
          data.Records.forEach(r => {
            const key = r.dynamodb && r.dynamodb.Keys && this.aws.DynamoDB.Converter.output({M: r.dynamodb.Keys});
            this.emit('record', r, key);
          });
        }
        shard.iterator = data.NextShardIterator;
        callback();
      });
    }, (err) => {
      if (err) {
        this.emit('error', err);
        return job.done();
      }
      //if some shard does not longer has an iterator
      //we need to fetch the openshards again and
      //process again.
      if (this._shards.some(s => !s.iterator)) {
        delete this._shards;
        return this._getOpenShards((err, shards) => {
          if (err) {
            this.emit('error', err);
            return job.done();
          }
          this._shards = shards;
          this._process(job);
        });
      }
      job.done();
    });
  }

  start() {
    async.series([
      //try get stream arn with dynamodb.describeTable
      cb => {
        if (this._streamArn) { return cb(); }
        const dynamo = new this.aws.DynamoDB();
        dynamo.describeTable({ TableName: this._table }, (err, tableDescription) => {
          if (err) {
            return cb();
          }
          if (tableDescription && tableDescription.Table && tableDescription.Table.LatestStreamArn) {
            this._streamArn = tableDescription.Table.LatestStreamArn;
          }
          cb();
        });
      },

      //try get stream arn  with dynamodbstream.listStream
      cb => {
        if (this._streamArn) { return cb(); }
        this._ddbStream.listStreams({ TableName: this._table }, (err, result) => {
          if (err) {
            return cb(new Error(`Cannot retrieve the stream arn of ${this._table}: ` + err.message));
          }
          if (result && result.Streams && result.Streams[0]) {
            this._streamArn = result.Streams[0].StreamArn;
          }
          cb();
        });
      },

      //start the job
      cb => {
        this._getOpenShards((err, shards) => {
          if (err) {
            return cb(err);
          }

          this._shards = shards;

          this._job = schedule({
            millisecond: this._interval,
            start: Date.now()
          }, this._process.bind(this));

          cb();
        });
      }
    ], (err) => {
      if (err) {
        this.emit('error', err);
      }
    });
  }

  stop() {
    this._job.cancel();
  }
}

const Readable = require('stream').Readable;

class DynamodDBReadable extends Readable {
  constructor(options) {
    const opts = Object.assign({}, options, { objectMode: true });
    super(opts);
    this._subscriber = new DynamodDBSubscriber(opts);

    this._subscriber.on('record', (record) => {
      if (!this.push(record)) {
        this._subscriber.stop();
      }
    }).on('error', (err) => {
      this.emit('error', err);
    });
  }

  _read () {
    this._subscriber.start();
  }
}
const Stream = DynamodDBReadable
export {Stream}

export default DynamodDBSubscriber
