#!/bin/ash

NODE_ENV=test tape '**/*.test.js' | tap-spec
