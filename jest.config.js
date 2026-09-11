module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/miniprogram/domain'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
}
