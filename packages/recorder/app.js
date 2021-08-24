const fs = require('fs');
const path = require('path');
const fetchFlv = require('./fetch-flv');
const Client = require('sub-client');
const { getInfoByRoom } = require('./get-info');

let roomId; // shortId
let ts; // 开始时间戳

const taskId = Math.floor(Date.now() / 1000);

let getDir = (filename = '') =>
  path.resolve(__dirname, `../../record_${taskId}/${roomId}/${ts}/${filename}`);

function init() {
  // 初始化前需停止 loader & 创建新文件夹
  ts = Math.floor(Date.now() / 1000);

  // mkdir
  fs.mkdirSync(getDir(), { recursive: true });
}

let loaderInterval;
let lockerFetch;

// flv loader
async function loader() {
  if (lockerFetch) return;

  const { room_info, anchor_info } = await getInfoByRoom(roomId);

  const info = {
    // live_status 0闲置 1直播 2轮播
    liveStatus: room_info.live_status === 1,
    room_id: room_info.room_id, // 真实 roomId
  };

  // 未开播时 或 已经在 fetchFlv
  if (!info.liveStatus) return;

  fetchFlv(info.room_id)
    .then((res) => {
      if (res.ok) {
        if (loaderInterval && !loaderInterval._destroyed) {
          console.log(`${roomId}: clear loader Interval`);
          clearInterval(loaderInterval);
        }

        // 重新初始化
        init();

        console.log(`${roomId}: ${ts} fetching.`);

        // 防止由于 LIVE 的下发导致重复 fetch
        lockerFetch = true;

        // write into room_info.json
        fs.writeFileSync(getDir('room_info.json'), JSON.stringify(room_info));

        let filename = path.basename(new URL(res.url).pathname, '.flv');
        let writer = fs.createWriteStream(getDir(`${filename}.flv`));

        // res.body is a Node.js Readable stream
        let reader = res.body;
        reader.pipe(writer);

        reader.on('end', () => {
          console.log(`${roomId}: ${ts} fetch end.`);

          lockerFetch = false;

          // 防止因网络波动而 end 的情况
          loader();
        });
      } else {
        if (!loaderInterval || loaderInterval._destroyed) {
          // 停止推流后，但没有下播
          console.log(`${roomId}: ${ts} loader Interval`);

          loaderInterval = setInterval(function () {
            loader();
          }, 10 * 1000);
        }
      }
    })
    .catch((e) => {
      console.log(`${roomId}: ${ts} fetch catch error.`, e);

      lockerFetch = false;

      if (!loaderInterval || loaderInterval._destroyed) {
        loaderInterval = setInterval(function () {
          loader();
        }, 10 * 1000);
      }
    });
}

// app
module.exports = async function (shortId) {
  roomId = shortId;

  // 初始化
  init();

  const { room_info } = await getInfoByRoom(roomId);

  // 防止启动时已经在直播
  if (room_info.live_status === 1) {
    // fetchFlv 会初始化
    loader();
  }

  new Client({
    roomId: room_info.room_id, // 真实 roomId
    log: (...rest) => console.log(room_info.room_id, '=>', ...rest),
    // Client callback
    notify(msgBody) {
      const { op, body } = msgBody;

      // msgBody
      fs.appendFileSync(getDir('sub.json'), `${JSON.stringify(msgBody)}\n`);

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
            lockerFetch = false;

            if (loaderInterval && !loaderInterval._destroyed) {
              console.log(`${roomId}: PREPARING clear Interval`);
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
