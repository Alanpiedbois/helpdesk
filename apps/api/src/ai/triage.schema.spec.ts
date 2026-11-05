import { parseTriage } from './triage.schema.js';

describe('parseTriage', () => {
  it('accepts a well-formed answer', () => {
    expect(
      parseTriage('{"category":"billing","priority":"URGENT","summary":" Double charge. "}'),
    ).toEqual({ category: 'billing', priority: 'URGENT', summary: 'Double charge.' });
  });

  it('rejects a category outside the fixed list', () => {
    expect(() =>
      parseTriage('{"category":"hacking","priority":"LOW","summary":"x"}'),
    ).toThrow();
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseTriage('Sure! Here is the classification')).toThrow();
  });

  it('caps an overly long summary', () => {
    const long = 'a'.repeat(2_000);
    const triage = parseTriage(
      JSON.stringify({ category: 'other', priority: 'LOW', summary: long }),
    );
    expect(triage.summary).toHaveLength(500);
  });
});
