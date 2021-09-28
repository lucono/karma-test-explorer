module.exports = {
  roots: ['<rootDir>'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testRegex: 'test/.*\\.test\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'd.ts'],
  testEnvironment: 'node'
};
