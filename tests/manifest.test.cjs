'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

test('package.json, plugin.json and marketplace.json versions are equal and 0.8.0', () => {
  assert.strictEqual(readJson('package.json').version, '0.8.0');
  assert.strictEqual(readJson('.claude-plugin/plugin.json').version, '0.8.0');
  assert.strictEqual(readJson('.claude-plugin/marketplace.json').metadata.version, '0.8.0');
});
