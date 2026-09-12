module.exports = {
  testEnvironment: 'node',
  // 测试放在 miniprogram/ 之外：开发者工具把 __tests__ 当保留目录并报忽略告警，
  // 而且不该把测试打进包里
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
}
