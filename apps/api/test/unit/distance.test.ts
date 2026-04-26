import { describe, it, expect } from 'vitest';
import { haversineKm, EARTH_RADIUS_KM } from '../../src/domain/distance.js';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });

  it('matches LAX → JFK known distance (~3974 km)', () => {
    // Spec §2 warehouse coords are airport-resolution (LAX, JFK).
    const la = { lat: 33.9425, lng: -118.408056 };
    const ny = { lat: 40.639722, lng: -73.778889 };
    expect(haversineKm(la, ny)).toBeGreaterThan(3970);
    expect(haversineKm(la, ny)).toBeLessThan(3980);
  });

  it('matches CDG → WAW known distance (~1343 km)', () => {
    // Spec §2 warehouse coords are airport-resolution (CDG, WAW).
    const paris = { lat: 49.009722, lng: 2.547778 };
    const warsaw = { lat: 52.165833, lng: 20.967222 };
    expect(haversineKm(paris, warsaw)).toBeGreaterThan(1340);
    expect(haversineKm(paris, warsaw)).toBeLessThan(1350);
  });

  it('antipodes are roughly π * R apart', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 180 };
    expect(haversineKm(a, b)).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 0);
  });

  it('is symmetric', () => {
    const a = { lat: 22.308889, lng: 113.914444 };
    const b = { lat: 13.7563, lng: 100.5018 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });

  it('handles dateline crossing', () => {
    expect(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }))
      .toBeLessThan(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: 0 }));
  });

  it('exposes EARTH_RADIUS_KM = 6371', () => {
    expect(EARTH_RADIUS_KM).toBe(6371);
  });
});
