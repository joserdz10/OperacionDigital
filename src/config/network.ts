export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const defaultContext = {
  territoryCode: 'BR-MX-NL',
  identityCode: 'NL-01',
};
