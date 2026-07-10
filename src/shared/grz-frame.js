'use strict';

const zlib = require('zlib');

const GRZ_PREFIX = 'GRZ1';
const GRZ_PREFIX_BUFFER = Buffer.from(GRZ_PREFIX, 'ascii');
const GRZ_HEADER_BYTES = 5;
const GRZ_VERSION_GZIP_JSON = 1;

function isGrzFrameBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= GRZ_HEADER_BYTES
    && buffer.subarray(0, 4).equals(GRZ_PREFIX_BUFFER);
}

function summarizeGrzEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const output = {};
  for (const key of [
    'entity_id',
    'user_id',
    'name',
    'x',
    'y',
    'vx',
    'vy',
    'hp',
    'max_hp',
    'life',
    'visible',
    'joined',
    'current_join_mode',
    'drop',
    'Drop',
    'reward',
    'coin_reward',
    'death_reward_preview',
    'death_drop_coins',
    'coins'
  ]) {
    if (entity[key] !== undefined) output[key] = entity[key];
  }
  if (Array.isArray(entity.cell)) output.cell = entity.cell.slice(0, 2);
  return Object.keys(output).length ? output : null;
}

function summarizeGrzShotAck(json) {
  const output = {};
  for (const key of [
    'type',
    'bullet_id',
    'owner_user_id',
    'start_x',
    'start_y',
    'target_x',
    'target_y',
    'dir_x_micros',
    'dir_y_micros',
    'range_cm',
    'speed_per_tick',
    'created_tick',
    'expire_tick'
  ]) {
    if (json[key] !== undefined) output[key] = json[key];
  }
  return output;
}

function summarizeGrzJson(json, userId = 0) {
  if (!json || typeof json !== 'object') return null;
  const hasEntities = Array.isArray(json.entities);
  const hasBullets = Array.isArray(json.bullets);
  const entities = hasEntities ? json.entities : [];
  const bullets = hasBullets ? json.bullets : [];
  const summary = {
    type: typeof json.type === 'string' ? json.type : '',
    tick: Number.isFinite(Number(json.tick)) ? Number(json.tick) : undefined,
    keyCount: Object.keys(json).length
  };
  if (hasEntities) summary.entityCount = entities.length;
  if (hasBullets) summary.bulletCount = bullets.length;
  if (Array.isArray(json.coin_drops)) summary.coinDropCount = json.coin_drops.length;
  if (Array.isArray(json.messages)) summary.messageCount = json.messages.length;
  if (json.total_entities !== undefined) summary.totalEntities = json.total_entities;
  if (json.in_game !== undefined) summary.inGameCount = json.in_game;
  if (json.visible !== undefined) summary.visibleCount = json.visible;
  if (json.occupied_cells !== undefined) summary.occupiedCells = json.occupied_cells;

  const self = userId ? entities.find(entity => Number(entity?.user_id) === Number(userId)) : null;
  if (userId && hasEntities) summary.selfPresent = Boolean(self);
  if (self) summary.self = summarizeGrzEntity(self);

  if (summary.type === 'shoot_ok') {
    summary.ack = summarizeGrzShotAck(json);
  }
  return summary;
}

function parseGrzFrame(buffer, options = {}) {
  const decodedTextSampleBytes = Math.max(0, Number(options.decodedTextSampleBytes || 0));
  const userId = Number(options.userId || 0);
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('parseGrzFrame requires a Buffer');
  }
  const frame = {};
  if (!isGrzFrameBuffer(buffer)) return frame;

  frame.format = GRZ_PREFIX;
  frame.version = buffer[4];
  const payload = buffer.subarray(GRZ_HEADER_BYTES);
  frame.payloadByteLength = payload.length;
  if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
    frame.compression = 'gzip';
    try {
      const decoded = zlib.gunzipSync(payload);
      const decodedText = decoded.toString('utf8');
      frame.decodedByteLength = decoded.length;
      if (decodedTextSampleBytes > 0) {
        frame.decodedTextSample = decodedText.slice(0, decodedTextSampleBytes);
      }
      try {
        const json = JSON.parse(decodedText);
        if (options.includeJson) frame.decodedJson = json;
        frame.decodedJsonKeys = json && typeof json === 'object' ? Object.keys(json).slice(0, 20) : [];
        frame.decodedType = typeof json?.type === 'string' ? json.type : '';
        if (Number.isFinite(Number(json?.tick))) frame.decodedTick = Number(json.tick);
        frame.decodedSummary = summarizeGrzJson(json, userId);
      } catch (err) {
        frame.jsonParseError = err?.message || String(err);
      }
    } catch (err) {
      frame.decodeError = err?.message || String(err);
    }
  } else {
    frame.compression = 'unknown';
  }
  return frame;
}

module.exports = {
  GRZ_HEADER_BYTES,
  GRZ_PREFIX,
  GRZ_VERSION_GZIP_JSON,
  isGrzFrameBuffer,
  parseGrzFrame,
  summarizeGrzEntity,
  summarizeGrzJson,
  summarizeGrzShotAck
};
