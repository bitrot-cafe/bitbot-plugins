import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, maxSuspensions, memberListProblem, plan, type ManagedUser } from './sync.js';

const u = (uid: string, enabled: boolean, suspended: boolean): ManagedUser => ({ uid, enabled, suspended });

test('decide: should have access', () => {
  assert.equal(decide(u('a', true, false), true), null); // fine as is
  assert.equal(decide(u('a', false, true), true), 'restore'); // we disabled them
  assert.equal(decide(u('a', true, true), true), 'restore'); // restore interrupted after enable: drop marker
  assert.equal(decide(u('a', false, false), true), 'admin-disabled'); // admin's call: leave alone
});

test('decide: should not have access', () => {
  assert.equal(decide(u('a', true, false), false), 'suspend');
  assert.equal(decide(u('a', true, true), false), 'suspend'); // suspend interrupted after marker: disable
  assert.equal(decide(u('a', false, true), false), null); // already suspended by us
  assert.equal(decide(u('a', false, false), false), 'admin-disabled'); // locked out already, not ours to mark
});

test('plan: collects actions and admin-disabled users', () => {
  const users = [u('keep', true, false), u('lost-role', true, false), u('regained', false, true), u('admin', false, false)];
  const access = new Set(['keep', 'regained', 'admin']);
  const { actions, adminDisabled } = plan(users, (uid) => access.has(uid));
  assert.deepEqual(actions, [
    { uid: 'lost-role', verdict: 'suspend' },
    { uid: 'regained', verdict: 'restore' },
  ]);
  assert.deepEqual(adminDisabled, ['admin']);
});

test('maxSuspensions: at least 3, otherwise 20%', () => {
  assert.equal(maxSuspensions(0), 3);
  assert.equal(maxSuspensions(10), 3);
  assert.equal(maxSuspensions(50), 10);
  assert.equal(maxSuspensions(51), 11); // rounds up
});

test('memberListProblem: rejects empty and partial lists', () => {
  assert.match(memberListProblem(0, 10)!, /empty/);
  assert.match(memberListProblem(80, 100)!, /partial/);
  assert.equal(memberListProblem(95, 100), null);
  assert.equal(memberListProblem(5, null), null); // no count to compare against
});
