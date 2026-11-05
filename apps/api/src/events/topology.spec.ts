import { failureAction, MAX_ATTEMPTS, WORK_QUEUES } from './topology.js';

describe('failureAction', () => {
  it('retries until the last attempt, then dead-letters', () => {
    expect(failureAction(1)).toBe('retry');
    expect(failureAction(MAX_ATTEMPTS - 1)).toBe('retry');
    expect(failureAction(MAX_ATTEMPTS)).toBe('dead-letter');
  });
});

describe('WORK_QUEUES', () => {
  it('sends new tickets both to e-mail notifications and to AI triage', () => {
    expect(WORK_QUEUES.email.bindings).toContain('ticket.created');
    expect(WORK_QUEUES.aiTriage.bindings).toContain('ticket.created');
  });
});
