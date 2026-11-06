'use strict';

const fs = require('fs');

function createJsonlAppender(options = {}) {
  const io = options.fs || fs;
  const cleanFiles = new Set();
  const tail = Buffer.alloc(1);
  return function appendJsonl(file, line) {
    let prefix = '';
    if (!cleanFiles.has(file)) {
      let descriptor;
      try {
        descriptor = io.openSync(file, 'r');
        const size = io.fstatSync(descriptor).size;
        if (size > 0 && io.readSync(descriptor, tail, 0, 1, size - 1) === 1 && tail[0] !== 10) {
          prefix = '\n';
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      } finally {
        if (descriptor !== undefined) io.closeSync(descriptor);
      }
    }
    try {
      // A failed append can leave a partial JSON row. Isolate that retained
      // evidence before the next good row, including after process restart.
      io.appendFileSync(file, prefix + line);
    } catch (error) {
      cleanFiles.delete(file);
      throw error;
    }
    cleanFiles.add(file);
    // Completed battle files need no permanent per-file state. Eviction only
    // causes another one-byte tail check if an old stream is used again.
    if (cleanFiles.size > 256) cleanFiles.delete(cleanFiles.values().next().value);
  };
}

module.exports = { createJsonlAppender };
