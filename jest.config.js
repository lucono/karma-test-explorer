module.exports = {
  roots: ['<rootDir>'],
  preset: 'ts-jest',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testRegex: 'test/.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'd.ts'],
  testEnvironment: 'node'
};
