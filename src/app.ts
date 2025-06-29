import fs from 'node:fs';
import path from 'node:path';
import Client from 'bilibili-ws-client';

import fetchFlv from './fetch-flv.ts';
import {
  getBuvid,
  getDanmuInfo,
  getInfoByRoom,
  getWbiKeys,
} from './get-info.ts';
import WbiSign from './wbiSign.ts';

const getTimestamp = () => Math.floor(Date.now() / 1000);

let ts = getTimestamp();

type Context = {
  roomId: number; // shortId
  ts: number; // 开始时间戳
  fetching: boolean;
  filename: string;
};

let ctx: Context = {
  roomId: 1, // shortId
  ts, // 开始时间戳
  fetching: false,
  filename: '',
};

const pwd = () =>
  path.resolve(import.meta.dirname, `../record_${ts}/${ctx.roomId}/${ctx.ts}`);

function mkdir(newTask = false) {
  if (ctx.fetching) return;

  if (newTask) {
    ts = getTimestamp();
  }

  ctx.ts = Math.floor(Date.now() / 1000);

  // mkdir
  fs.mkdirSync(pwd(), { recursive: true });
}

async function init() {
  // 初始化前需停止 fetching 再创建新文件夹
  if (ctx.fetching) return;

  mkdir();

  let b_3: string, room_info: any, token: string;
  try {
    const { img_key, sub_key } = await getWbiKeys();
    const wbi = new WbiSign(img_key, sub_key);

    ({ b_3 } = await getBuvid());
    ({ room_info } = await getInfoByRoom(ctx.roomId, wbi));
    ({ token } = await getDanmuInfo(room_info.room_id, wbi, b_3));
  } catch (e) {
    console.error(
      '[%s] %s: %s init catch error.',
      new Date().toLocaleString(),
      ctx.roomId,
      ctx.ts
    );

    // sleep 10s
    await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
    init();

    return;
  }

  // 防止启动时已经在直播
  if (room_info.live_status === 1) {
    loader();
  }

  return { b_3, room_info, token };
}

let timer: NodeJS.Timeout | null;

let img_key: string, sub_key: string;

// flv loader
async function loader() {
  if (ctx.fetching) return;

  if (!img_key || !sub_key) {
    ({ img_key = '', sub_key = '' } = await getWbiKeys());
  }

  const wbi = new WbiSign(img_key, sub_key);

  let room_info;
  try {
    ({ room_info } = await getInfoByRoom(ctx.roomId, wbi));
  } catch (e) {
    console.error(
      '[%s] %s: %s loader getInfoByRoom catch error.',
      new Date().toLocaleString(),
      ctx.roomId,
      ctx.ts
    );

    // 重新获取 key
    img_key = '';
    sub_key = '';

    if (!timer) {
      timer = setInterval(function () {
        loader();
      }, 10 * 1000);
    }

    return;
  }

  // live_status 0闲置 1直播 2轮播
  if (room_info.live_status !== 1) {
    // 未开播时 或 已经在 fetchFlv
    return;
  }

  try {
    const res = await fetchFlv(room_info.room_id, wbi); // 真实 roomId

    if (res.ok) {
      if (timer) {
        console.log(
          `[%s] %s: %s clear loader Interval`,
          new Date().toLocaleString(),
          ctx.roomId,
          ctx.ts
        );
        clearInterval(timer);
        timer = null;
      }

      // 重新初始化目录
      mkdir();

      console.log(
        '[%s] %s: %s fetching.',
        new Date().toLocaleString(),
        ctx.roomId,
        ctx.ts
      );

      // 防止由于 LIVE 的多次下发导致重复 fetch
      ctx.fetching = true;

      // write into room_info.json
      fs.writeFileSync(
        path.resolve(pwd(), 'room_info.json'),
        JSON.stringify(room_info)
      );

      const filename = path.basename(new URL(res.url).pathname, '.flv');
      ctx.filename = filename + '.flv';

      const writer = fs.createWriteStream(path.resolve(pwd(), ctx.filename));

      // res.body is a Node.js Readable stream
      const reader = res.body;
      reader?.pipe(writer);

      reader?.on('end', () => {
        console.log(
          '[%s] %s: %s fetch end.',
          new Date().toLocaleString(),
          ctx.roomId,
          ctx.ts
        );

        ctx.fetching = false;

        // 防止因网络波动而 end 的情况
        loader();
      });
    } else {
      if (!timer) {
        // 停止推流后，但没有下播
        console.log(
          '[%s] %s: %s loader Interval',
          new Date().toLocaleString(),
          ctx.roomId,
          ctx.ts
        );

        timer = setInterval(function () {
          loader();
        }, 10 * 1000);
      }
    }
  } catch (e) {
    console.error(
      '[%s] %s: %s fetch catch error.',
      new Date().toLocaleString(),
      ctx.roomId,
      ctx.ts
    );

    ctx.fetching = false;

    if (!timer) {
      timer = setInterval(function () {
        loader();
      }, 10 * 1000);
    }
  }
}

// app
export default async function (shortId: number) {
  ctx.roomId = shortId;

  // 初始化
  const { b_3, room_info, token } = (await init()) || {};
  const { room_id } = room_info || {};

  let lastMsgBody: any;

  // 真实 roomId
  const sub = new Client({
    uid: 0, // 留空或为 0 代表访客，无法显示弹幕发送用户
    roomid: room_id,
    protover: 3,
    buvid: b_3 || '',
    platform: 'web',
    type: 2,
    key: token,
  });

  sub.on('message', async (msgBody) => {
    const { op, cmd, body, ts } = msgBody;

    if (typeof body === 'string') {
      msgBody.body = JSON.parse(body);
    }

    // msgBody
    if (ts - (lastMsgBody?.ts || ts) <= 70) {
      if (op === 3 && !ctx.fetching && ts - ctx.ts > 3600) {
        const filename = path.resolve(pwd(), ctx.filename);

        if (fs.existsSync(filename)) {
          // 收到心跳时，判断在非串流时且目录已经创建超过 3600 秒
          const mtime = Math.floor(fs.statSync(filename).mtimeMs / 1000);

          if (ts > mtime + 60 * 5) {
            // 收到心跳的时间戳大于 flv 文件最后修改时间 60 * 5 秒
            mkdir(true);
          }
        }
      }

      fs.appendFileSync(
        path.resolve(pwd(), 'sub.json'),
        `${JSON.stringify(msgBody)}\n`
      );
    } else {
      await init();
    }

    lastMsgBody = msgBody;

    if (op === 3) {
      // 收到心跳判断是否开播，2023-08-30 起 body 恒定为 1
      // 防止未收到 LIVE cmd
      loader();
    } else if (op === 5) {
      switch (cmd) {
        case 'LIVE':
          // 开播 可以获取直播流
          // 切换 码率kbps 帧率fps 也会触发 LIVE
          loader();
          break;
        case 'PREPARING':
          // 闲置（下播）
          ctx.fetching = false;

          if (timer) {
            clearInterval(timer);
            timer = null;

            console.log(
              '[%s] %s: %s PREPARING clear Interval',
              new Date().toLocaleString(),
              ctx.roomId,
              ctx.ts
            );
          }

          break;
        default:
          break;
      }
    }
  });

  sub.on('error', (err) => {
    console.error(
      '[%s] %s: %s',
      new Date().toLocaleString(),
      err.name,
      err.message
    );
  });
}
