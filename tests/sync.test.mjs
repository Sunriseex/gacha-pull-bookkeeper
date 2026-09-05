import test from 'node:test';
import assert from 'node:assert/strict';
import { promptSyncToken, isLocalSyncPage } from '../src/ui/sync.js';

class Dialog extends EventTarget {
  input = { value: '' };
  cancel = new EventTarget();
  open = false;
  returnValue = '';
  querySelector(id) { return id === '#tokenDialogInput' ? this.input : this.cancel; }
  showModal() { this.open = true; }
  close(value) {
    if (value !== undefined) this.returnValue = value;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}

for (const action of ['save', 'cancel button', 'Escape']) {
  test(`token dialog: ${action}`, async () => {
    const dialog = new Dialog();
    const saved = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = promptSyncToken({ dialog, saveToken: (token) => saved.push(token) });
      dialog.input.value = '  sample-token  ';
      if (action === 'save') dialog.close('save');
      if (action === 'cancel button') dialog.cancel.dispatchEvent(new Event('click'));
      if (action === 'Escape') {
        dialog.dispatchEvent(new Event('cancel'));
        dialog.close();
      }
      assert.equal(await result, action === 'save' ? 'sample-token' : '');
      assert.equal(dialog.open, false);
      assert.equal(dialog.input.value, '');
    }
    assert.deepEqual(saved, action === 'save' ? ['sample-token', 'sample-token'] : []);
  });
}

test('public pages never offer the local sync control', () => {
  for (const url of ['https://pulls.sunriseex.dev', 'https://example.org', 'file:///tmp/index.html']) {
    assert.equal(isLocalSyncPage(new URL(url)), false);
  }
  assert.equal(isLocalSyncPage(new URL('http://localhost:4173')), true);
  assert.equal(isLocalSyncPage(new URL('http://127.0.0.1:5173')), true);
});
