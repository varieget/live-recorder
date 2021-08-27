const fs = require('fs');
const path = require('path');
const fetchFlv = require('./fetch-flv');
const Client = require('sub-client');
const { getInfoByRoom } = require('./get-info');

let ctx = {
  roomId: null, // shortId
  ts: Math.floor(Date.now() / 1000), // 开始时间戳
  lockerFetch: false,
};

const taskId = 'record_' + Math.floor(Date.now() / 1000);

const pwd = () =>
  path.resolve(__dirname, `../../${taskId}/${ctx.roomId}/${ctx.ts}`);

async function init(checkStatus = true) {
  // 初始化前需停止 loader 再创建新文件夹
  ctx.ts = Math.floor(Date.now() / 1000);

  // mkdir
  fs.mkdirSync(pwd(), { recursive: true });

  if (checkStatus) {
    const { room_info } = await getInfoByRoom(ctx.roomId);

    // 防止启动时已经在直播
    if (room_info.live_status === 1) {
      loader();
    }

    return room_info;
  }
}

let loaderInterval;

// flv loader
async function loader() {
  if (ctx.lockerFetch) return;

  const { room_info, anchor_info } = await getInfoByRoom(ctx.roomId);

  const info = {
    // live_status 0闲置 1直播 2轮播
    liveStatus: room_info.live_status === 1,
    room_id: room_info.room_id, // 真实 roomId
  };

  // 未开播时 或 已经在 fetchFlv
  if (!info.liveStatus) return;

  fetchFlv(info.room_id)
    .then(async (res) => {
      if (res.ok) {
        if (loaderInterval && !loaderInterval._destroyed) {
          console.log(`${ctx.roomId}: clear loader Interval`);
          clearInterval(loaderInterval);
        }

        // 重新初始化目录
        await init(false);

        console.log(`${ctx.roomId}: ${ctx.ts} fetching.`);

        // 防止由于 LIVE 的下发导致重复 fetch
        ctx.lockerFetch = true;

        // write into room_info.json
        fs.writeFileSync(pwd() + '/room_info.json', JSON.stringify(room_info));

        const filename = path.basename(new URL(res.url).pathname, '.flv');
        const writer = fs.createWriteStream(pwd() + `/${filename}.flv`);

        // res.body is a Node.js Readable stream
        const reader = res.body;
        reader.pipe(writer);

        reader.on('end', () => {
          console.log(`${ctx.roomId}: ${ctx.ts} fetch end.`);

          ctx.lockerFetch = false;

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
    })
    .catch((e) => {
      console.log(`${ctx.roomId}: ${ctx.ts} fetch catch error.`, e);

      ctx.lockerFetch = false;

      if (!loaderInterval || loaderInterval._destroyed) {
        loaderInterval = setInterval(function () {
          loader();
        }, 10 * 1000);
      }
    });
}

// app
module.exports = async function (shortId) {
  ctx.roomId = shortId;

  // 初始化
  const { room_id } = await init();

  let lastMsgBody;

  new Client({
    roomId: room_id, // 真实 roomId
    log: (...rest) => console.log(room_id, '=>', ...rest),
    // Client callback
    notify: async (msgBody) => {
      const { op, body, ts } = msgBody;

      // msgBody
      if (ts - (lastMsgBody?.ts || ts) <= 30) {
        fs.appendFileSync(pwd() + '/sub.json', `${JSON.stringify(msgBody)}\n`);
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
        switch (body.cmd) {
          case 'LIVE':
            // 开播 可以获取直播流
            // 切换 码率kbps 帧率fps 也会触发 LIVE
            loader();
            break;
          case 'PREPARING':
            // 闲置（下播）
            ctx.lockerFetch = false;

            if (loaderInterval && !loaderInterval._destroyed) {
              console.log(`${ctx.roomId}: PREPARING clear Interval`);
              clearInterval(loaderInterval);
            }

            break;
          default:
            break;
        }
      }
    },
  });
};
