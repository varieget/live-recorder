import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Client from 'bilibili-ws-client';

import fetchFlv from './fetch-flv.js';
import { getInfoByRoom } from './get-info.js';

const getTimestamp = () => Math.floor(Date.now() / 1000);

let ts = getTimestamp();

let ctx = {
  roomId: null, // shortId
  ts, // 开始时间戳
  fetching: false,
};

const pwd = () =>
  path.resolve(
    path.dirname(fileURLToPath(new URL('', import.meta.url))),
    `../record_${ts}/${ctx.roomId}/${ctx.ts}`
  );

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

  const { room_info } = await getInfoByRoom(ctx.roomId);

  // 防止启动时已经在直播
  if (room_info.live_status === 1) {
    loader();
  }

  return room_info;
}

let loaderInterval;

// flv loader
async function loader() {
  if (ctx.fetching) return;

  const { room_info, anchor_info } = await getInfoByRoom(ctx.roomId);

  // live_status 0闲置 1直播 2轮播
  if (room_info.live_status !== 1) {
    // 未开播时 或 已经在 fetchFlv
    return;
  }

  try {
    const res = await fetchFlv(room_info.room_id); // 真实 roomId

    if (res.ok) {
      if (loaderInterval && !loaderInterval._destroyed) {
        console.log(`${ctx.roomId}: clear loader Interval`);
        clearInterval(loaderInterval);
      }

      // 重新初始化目录
      mkdir();

      console.log(`${ctx.roomId}: ${ctx.ts} fetching.`);

      // 防止由于 LIVE 的多次下发导致重复 fetch
      ctx.fetching = true;

      // write into room_info.json
      fs.writeFileSync(pwd() + '/room_info.json', JSON.stringify(room_info));

      const filename = path.basename(new URL(res.url).pathname, '.flv');
      const writer = fs.createWriteStream(pwd() + `/${filename}.flv`);

      // res.body is a Node.js Readable stream
      const reader = res.body;
      reader.pipe(writer);

      reader.on('end', () => {
        console.log(`${ctx.roomId}: ${ctx.ts} fetch end.`);

        ctx.fetching = false;

        // 防止因网络波动而 end 的情况
        loader();
      });
    } else {
      if (!loaderInterval || loaderInterval._destroyed) {
        // 停止推流后，但没有下播
        console.log(`${ctx.roomId}: ${ctx.ts} loader Interval`);

        loaderInterval = setInterval(function () {
          loader();
        }, 10 * 1000);
      }
    }
  } catch (e) {
    console.log(`${ctx.roomId}: ${ctx.ts} fetch catch error.`, e);

    ctx.fetching = false;

    if (!loaderInterval || loaderInterval._destroyed) {
      loaderInterval = setInterval(function () {
        loader();
      }, 10 * 1000);
    }
  }
}

// app
export default async function (shortId) {
  ctx.roomId = shortId;

  // 初始化
  const { room_id } = await init();

  let lastMsgBody;

  // 真实 roomId
  const sub = new Client(room_id);

  sub.on('message', async (msgBody) => {
    const { op, cmd, body, ts } = msgBody;

    if (typeof body === 'string') {
      msgBody.body = JSON.parse(body);
    }

    // msgBody
    if (ts - (lastMsgBody?.ts || ts) <= 70) {
      if (!ctx.fetching && ts - ctx.ts > 3600) {
        mkdir(true);
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
      // 通过在线人数判断是否开播
      // 防止未收到 LIVE cmd
      if (body > 1) {
        loader();
      }
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

          if (loaderInterval && !loaderInterval._destroyed) {
            console.log(`${ctx.roomId}: PREPARING clear Interval`);
            clearInterval(loaderInterval);
          }

          break;
        default:
          break;
      }
    }
  });

  sub.on('error', (err) => {
    throw new Error(err);
  });
}
