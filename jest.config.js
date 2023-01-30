export default {
  roots: ['<rootDir>'],
  preset: 'ts-jest',
  resolver: 'ts-jest-resolver',
  testRegex: 'test/.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'd.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node'
};
