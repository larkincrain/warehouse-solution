import { describe, it, expect } from 'vitest';
import { bankersRound } from '../../src/domain/rounding.js';

describe('bankersRound', () => {
  it('rounds .5 to nearest even (down case)', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(2.5)).toBe(2);
  });
  it('rounds .5 to nearest even (up case)', () => {
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });
  it('rounds non-half values normally', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
    expect(bankersRound(-1.6)).toBe(-2);
  });
  it('passes through integers', () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(7)).toBe(7);
    expect(bankersRound(-3)).toBe(-3);
  });
  it('handles negative half values', () => {
    expect(bankersRound(-0.5)).toBe(0);
    expect(bankersRound(-1.5)).toBe(-2);
    expect(bankersRound(-2.5)).toBe(-2);
  });
});
