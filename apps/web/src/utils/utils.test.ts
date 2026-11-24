import { describe, expect, it } from 'vitest';
import { anchorOf } from '@/lessons/anchor';
import { safeNext } from './safeNext';
import { formatDuration, minutes } from './format';

describe('anchorOf', () => {
  it('produces stable, URL-safe fragments', () => {
    expect(anchorOf('Why Services exist')).toBe('why-services-exist');
    expect(anchorOf('Reading an `EndpointSlice`')).toBe('reading-an-endpointslice');
    expect(anchorOf('externalTrafficPolicy: Cluster vs Local')).toBe('externaltrafficpolicy-cluster-vs-local');
  });
});

describe('safeNext (open-redirect guard after login)', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/learn/services')).toBe('/learn/services');
    expect(safeNext('//evil.example.com')).toBe('/');
    expect(safeNext('https://evil.example.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('format', () => {
  it('formats durations and minutes', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
    expect(minutes(40)).toBe('40 min');
    expect(minutes(90)).toBe('1 h 30 min');
  });
});
