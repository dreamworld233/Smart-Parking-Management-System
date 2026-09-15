module.exports = {
  testEnvironment: 'node',
  // 测试放在 miniprogram/ 之外：开发者工具把 __tests__ 当保留目录并报忽略告警，
  // 而且不该把测试打进包里
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    // 云函数是 CommonJS 的 .js，测试要 require 它们（如 createReservation/pricing.js）。
    // ts-jest 在 allowJs 下按「转译不检查」处理 .js，够用且与 .ts 同一条管带
    '^.+\\.js$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
}
