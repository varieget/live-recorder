# live-recorder

本项目用于监听 bilibili 直播的 ws 数据。当发现 ws 下发主播开播指令时，自动拉取直播间的 `http-flv` 流。

简而言之，就是**录播机**。这是关于 [bilibili-ws-client](https://github.com/varieget/bilibili-ws-client) 的一个实现。

## 配置

使用 [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) 读取配置文件，默认优先级如下：

- `.recorderrc`
- `.recorderrc.json`, `.recorderrc.yaml`, `.recorderrc.yml`
- `.recorderrc.js`, `.recorderrc.cjs`

推荐参考 `.recorderrc.yml` 创建一个名为 `.recorderrc.yaml` 的配置文件。

## 运行

使用 `yarn start` 开始运行

使用 `yarn clear` 清理没有 flv 的目录

## 参考

- [bilibili-ws-client](https://github.com/varieget/bilibili-ws-client)
