import Client from 'bilibili-ws-client';

import Recorder from './recorder.ts';

// app
export default async function app(shortId: number) {
  const recorder = new Recorder(shortId);

  // 初始化
  const { b_3, room_info, token } = (await recorder.init()) || {};
  const { room_id } = room_info || {};

  // 真实 roomId
  const sub = new Client(
    {
      uid: 0, // 留空或为 0 代表访客，无法显示弹幕发送用户
      roomid: room_id,
      protover: 3,
      buvid: b_3 || '',
      platform: 'web',
      type: 2,
      key: token,
    },
    false,
    // (...args) =>
    //   console.log(
    //     '[%s] %s: %s client log:',
    //     new Date().toLocaleString(),
    //     recorder.roomId,
    //     recorder.ts,
    //     ...args
    //   ),
    0 // 接管自动重试，手动 sub.close()，重新调用 app(recorder.roomId) 获取新 token
  );

  // 将 WebSocket 客户端传入 Recorder
  recorder.subClient = sub;

  sub.on('message', recorder.messageReceiver.bind(recorder));

  sub.on('close', () => {
    app(recorder.roomId);
  });

  sub.on('error', (err) => {
    console.error(
      '[%s] %s: %s client error: %s',
      new Date().toLocaleString(),
      recorder.roomId,
      recorder.ts,
      err.message
    );
  });
}
