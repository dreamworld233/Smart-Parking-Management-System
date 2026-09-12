// 打真接口的套件，与默认单测分开：默认那套必须能在断网、没有 Key 的机器上跑
const base = require('./jest.config')

module.exports = {
  ...base,
  roots: ['<rootDir>/tests/live'],
  testMatch: ['**/*.live.ts'],
  // 真网络 + 无缓存，给够时间；单次断言超时另在各条里单独设
  testTimeout: 30000,
}
