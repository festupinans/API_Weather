/**
 * Traducción de códigos WMO (campo `weather_code` de Open-Meteo) a una descripción en español.
 * Referencia: https://open-meteo.com/en/docs (sección "WMO Weather interpretation codes").
 * Se agrupan por condición principal; la intensidad (ligera, moderada, fuerte) no se distingue.
 */
const CONDITION_GROUPS: ReadonlyArray<[codes: number[], description: string]> = [
  [[0], 'Despejado'],
  [[1], 'Mayormente despejado'],
  [[2], 'Parcialmente nublado'],
  [[3], 'Nublado'],
  [[45, 48], 'Niebla'],
  [[51, 53, 55, 56, 57], 'Llovizna'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Lluvia'],
  [[71, 73, 75, 77, 85, 86], 'Nieve'],
  [[95, 96, 99], 'Tormenta'],
];

const DESCRIPTION_BY_CODE: ReadonlyMap<number, string> = new Map(
  CONDITION_GROUPS.flatMap(([codes, description]) => codes.map((code) => [code, description] as const)),
);

export const UNKNOWN_CONDITION = 'Condición desconocida';

export function describeWeatherCode(code: number): string {
  return DESCRIPTION_BY_CODE.get(code) ?? UNKNOWN_CONDITION;
}
