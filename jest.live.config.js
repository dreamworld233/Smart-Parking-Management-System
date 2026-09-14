// 打真接口的套件，与默认单测分开：默认那套必须能在断网、没有 Key 的机器上跑
const base = require('./jest.config')

module.exports = {
  ...base,
  roots: ['<rootDir>/tests/live'],
  testMatch: ['**/*.live.ts'],
  // 真网络 + 无缓存，给够时间；单次断言超时另在各条里单独设
  testTimeout: 30000,
  // 必须串行：几个测试文件并行时会同时打同一张 Key，矩阵接口按目的地限流
  //（实测约 5 点/秒），后发的那批会拿到 status 120 —— 看起来像代码 bug，
  // 其实是测试自己挤自己
  maxWorkers: 1,
}
