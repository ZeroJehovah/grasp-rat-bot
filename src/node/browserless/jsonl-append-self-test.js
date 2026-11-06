'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonlAppender } = require('./jsonl-append');
const { createBrowserlessBackgroundIo } = require('./background-io');
const { createLocalLogStore } = require('./local-log-store');

async function runJsonlAppendSelfTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-jsonl-append-'));
  let worker;
  try {
    const file = path.join(directory, 'test.jsonl');
    let failures = 0, tailReads = 0;
    const append = createJsonlAppender({ fs: { ...fs,
      readSync(...args) { tailReads++; return fs.readSync(...args); },
      appendFileSync(target, text) {
        if (failures > 0) {
          failures--;
          fs.appendFileSync(target, text.slice(0, Math.min(5, text.length - 1)));
          throw Object.assign(new Error('ENOSPC: injected partial write'), { code: 'ENOSPC' });
        }
        fs.appendFileSync(target, text);
      }
    } });
    append(file, '{"id":1}\n');
    append(file, '{"id":2}\n');
    assert.equal(tailReads, 0, 'healthy appends need no repeated tail read');
    failures = 2;
    assert.throws(() => append(file, '{"id":3}\n'), /ENOSPC/);
    assert.throws(() => append(file, '{"id":4}\n'), /ENOSPC/);
    append(file, '{"id":5}\n');
    const rows = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    assert.deepEqual(rows, ['{"id":1}', '{"id":2}', '{"id"', '{"id', '{"id":5}']);
    assert.deepEqual(JSON.parse(rows.at(-1)), { id: 5 });
    const readsAfterRecovery = tailReads;
    append(file, '{"id":6}\n');
    assert.equal(tailReads, readsAfterRecovery);

    fs.appendFileSync(file, '{"partial":');
    createJsonlAppender()(file, '{"id":7}\n');
    assert(fs.readFileSync(file, 'utf8').endsWith('{"partial":\n{"id":7}\n'));
    const noNewline = path.join(directory, 'complete-no-newline.jsonl');
    fs.writeFileSync(noNewline, '{"id":8}');
    append(noNewline, '{"id":9}\n');
    assert.deepEqual(fs.readFileSync(noNewline, 'utf8').trim().split('\n').map(JSON.parse),
      [{ id: 8 }, { id: 9 }]);
    for (let i = 0; i < 257; i++) append(path.join(directory, `bounded-${i}`), '{}\n');
    fs.appendFileSync(file, '{"evicted":');
    append(file, '{"id":10}\n');
    assert(fs.readFileSync(file, 'utf8').endsWith('{"evicted":\n{"id":10}\n'));

    // Both production Worker entry points must recover a previous process's
    // partial tail and retain normal credential redaction.
    worker = createBrowserlessBackgroundIo();
    for (const kind of ['appendLog', 'appendRawLine']) {
      const target = path.join(directory, `${kind}.jsonl`);
      fs.writeFileSync(target, '{"broken":');
      assert(kind === 'appendLog'
        ? worker.appendLog({ file: target, atMs: 1000, type: 'recovered', detail: { token: 'secret-test', id: 11 } })
        : worker.appendRawLine(target, { token: 'secret-test', id: 11 }));
      const flushed = await worker.flush();
      assert.equal(flushed.ok, true);
      assert.equal(flushed.operationErrorCount, 0);
      const recovered = fs.readFileSync(target, 'utf8').trim().split('\n');
      assert.equal(recovered[0], '{"broken":');
      const entry = JSON.parse(recovered[1]);
      assert.equal((entry.detail || entry).token, '[redacted]');
      assert.equal((entry.detail || entry).id, 11);
    }
    const local = createLocalLogStore({ logDir: path.join(directory, 'local'), now: () => 1000 });
    const localFile = local.fileFor('runner');
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, '{"broken":');
    local.append('runner', 'recovered');
    assert.equal(JSON.parse(fs.readFileSync(localFile, 'utf8').trim().split('\n')[1]).type, 'recovered');
    return { ok: true, cases: 9 };
  } finally {
    if (worker) await worker.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { runJsonlAppendSelfTest };
if (require.main === module) runJsonlAppendSelfTest().then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error); process.exitCode = 1; });
