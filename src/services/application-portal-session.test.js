import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discardApplicationPortalSession,
  getApplicationPortalSession,
  stageApplicationPortalSession,
} from './application-portal-session.ts';

test('portal handoff accepts HTTPS only and stores selected values in memory', () => {
  assert.throws(() => stageApplicationPortalSession({
    url: 'http://portal.example.gov',
    confirmedFields: {},
  }), /HTTPS/);

  const id = stageApplicationPortalSession({
    url: 'https://portal.example.gov/apply',
    confirmedFields: { 'Applicant name': 'A User', OTP: '123456' },
  });
  assert.deepEqual(getApplicationPortalSession(id), {
    url: 'https://portal.example.gov/apply',
    confirmedFields: { 'Applicant name': 'A User' },
  });

  discardApplicationPortalSession(id);
  assert.equal(getApplicationPortalSession(id), null);
});

test('portal handoff rejects credential-bearing URLs', () => {
  assert.throws(() => stageApplicationPortalSession({
    url: 'https://name:password@portal.example.gov/apply',
    confirmedFields: {},
  }), /HTTPS/);
});
