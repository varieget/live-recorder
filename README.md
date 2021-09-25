# live-recorder

本项目适用于后台监听 bilibili 直播的 ws 数据。当发现 ws 下发主播开播指令时，自动拉取直播间的 `http-flv` 流。简而言之，就是 `录播机`。

## 安装

先决条件：请使用 `npm` 全局安装 `yarn`。

然后运行：

```shell
yarn
```

## 配置

请编辑 `./packages/recorder/config.js` 的直播间号，以数组保存。

## 运行

```shell
yarn start
```

亦可使用 pm2：

- [bilibili-ws-client](https://github.com/varieget/bilibili-ws-client)

```shell
pm2 start
```

## 参考

- [bilibili-ws-client](https://github.com/varieget/bilibili-ws-client)
