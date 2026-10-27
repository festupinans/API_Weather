import { describe, expect, it } from 'vitest';
import { describeWeatherCode, UNKNOWN_CONDITION } from '../../src/domain/weatherCondition';

describe('describeWeatherCode', () => {
  it.each([
    [0, 'Despejado'],
    [1, 'Mayormente despejado'],
    [2, 'Parcialmente nublado'],
    [3, 'Nublado'],
    [45, 'Niebla'],
    [48, 'Niebla'],
    [53, 'Llovizna'],
    [61, 'Lluvia'],
    [82, 'Lluvia'],
    [75, 'Nieve'],
    [86, 'Nieve'],
    [95, 'Tormenta'],
    [99, 'Tormenta'],
  ])('código %i → %s', (code, expected) => {
    expect(describeWeatherCode(code)).toBe(expected);
  });

  it.each([4, 50, 100, -1])('código desconocido %i → valor por defecto', (code) => {
    expect(describeWeatherCode(code)).toBe(UNKNOWN_CONDITION);
  });
});
