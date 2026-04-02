import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type Client from 'bilibili-ws-client';

import fetchFlv from './fetch-flv.ts';
import {
  getBuvid,
  getDanmuInfo,
  getInfoByRoom,
  getWbiKeys,
} from './get-info.ts';
import WbiSign from './wbiSign.ts';

const getTimestamp = () => Math.floor(Date.now() / 1000);

class Recorder {
  public readonly roomId: number; // shortId
  private recordTs: number; // record 文件夹开始时间戳
  public ts: number; // 开始时间戳

  private fetching: boolean = false;
  private filename: string = '';

  private timer: NodeJS.Timeout | null = null;

  private img_key?: string = '';
  private sub_key?: string = '';

  private client?: Client;

  /**
   * 直播流录制器
   * @constructor
   * @param {number} shortId - 房间号
   */
  constructor(shortId: number) {
    this.roomId = shortId;

    const ts = getTimestamp();
    this.recordTs = ts;
    this.ts = ts;
  }

  /**
   * 打印当前工作目录
   * @returns {string} 文件夹路径
   */
  private get pwd(): string {
    return path.resolve(
      import.meta.dirname,
      `../record_${this.recordTs}/${this.roomId}/${this.ts}`
    );
  }

  /**
   * 创建目录
   * @param {boolean} newTask - 是否创建新任务（新文件夹）
   */
  private async mkdir(newTask: boolean = false) {
    if (this.fetching) return;

    // 存在 filename 会导致收到心跳时 fs.stat 误判目录为文件
    this.filename = '';

    const newTs = getTimestamp();
    const newRecordTs = newTask ? newTs : this.recordTs;

    const newPath = path.resolve(
      import.meta.dirname,
      `../record_${newRecordTs}/${this.roomId}/${newTs}`
    );

    // mkdir
    await fs.mkdir(newPath, { recursive: true });

    // 目录创建成功后，才能更新 this.pwd
    this.recordTs = newRecordTs;
    this.ts = newTs;
  }

  /**
   * 初始化录制器
   * @returns 初始化信息，包括 b_3、room_info 和 token
   */
  public async init() {
    // 初始化前需停止 fetching 再创建新文件夹
    if (this.fetching) return;

    await this.mkdir();

    let b_3: string, room_info: any, token: string;
    try {
      const { img_key, sub_key } = await getWbiKeys();
      const wbi = new WbiSign(img_key, sub_key);

      this.img_key = img_key;
      this.sub_key = sub_key;

      ({ b_3 } = await getBuvid());
      ({ room_info } = await getInfoByRoom(this.roomId, wbi));
      ({ token } = await getDanmuInfo(room_info.room_id, wbi, b_3));
    } catch (err) {
      console.error(
        '[%s] %s: %s init catch error: %s',
        new Date().toLocaleString(),
        this.roomId,
        this.ts,
        err
      );

      // sleep 10s
      await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
      this.init();

      return;
    }

    // 防止启动时已经在直播
    if (room_info.live_status === 1) {
      this.loader(room_info);
    }

    return { b_3, room_info, token };
  }

  /**
   * flv loader
   * @param {any} room_info - 直播间信息（可选），避免重复请求 room_info
   */
  private async loader(room_info?: any) {
    if (this.fetching) return;

    if (!this.img_key || !this.sub_key) {
      const { img_key, sub_key } = await getWbiKeys();
      this.img_key = img_key;
      this.sub_key = sub_key;
    }

    const wbi = new WbiSign(this.img_key, this.sub_key);

    if (!room_info) {
      try {
        ({ room_info } = await getInfoByRoom(this.roomId, wbi));
      } catch (err) {
        console.error(
          '[%s] %s: %s loader getInfoByRoom catch error: %s',
          new Date().toLocaleString(),
          this.roomId,
          this.ts,
          err
        );

        // 重新获取 key
        this.img_key = '';
        this.sub_key = '';

        if (!this.timer) {
          this.timer = setInterval(() => {
            this.loader();
          }, 10 * 1000);
        }

        return;
      }
    }

    // live_status 0闲置 1直播 2轮播
    if (room_info.live_status !== 1) {
      // 未开播时 或 已经在 fetchFlv
      return;
    }

    try {
      const res = await fetchFlv(room_info.room_id, wbi); // 真实 roomId

      if (res.ok) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;

          console.log(
            `[%s] %s: %s clear loader Interval`,
            new Date().toLocaleString(),
            this.roomId,
            this.ts
          );
        }

        // 重新初始化目录
        await this.mkdir();

        console.log(
          '[%s] %s: %s fetching.',
          new Date().toLocaleString(),
          this.roomId,
          this.ts
        );

        // 防止由于 LIVE 的多次下发导致重复 fetch
        this.fetching = true;

        // write into room_info.json
        await fs.writeFile(
          path.resolve(this.pwd, 'room_info.json'),
          JSON.stringify(room_info)
        );

        const filename = path.basename(new URL(res.url).pathname, '.flv');
        this.filename = filename + '.flv';

        const writer = createWriteStream(path.resolve(this.pwd, this.filename));

        try {
          // res.body is a Readable stream
          const reader = res.body!;
          await pipeline(reader, writer);
        } catch (err) {
          console.error(
            '[%s] %s: %s pipeline error: %s',
            new Date().toLocaleString(),
            this.roomId,
            this.ts,
            err
          );
        } finally {
          console.log(
            '[%s] %s: %s fetch end.',
            new Date().toLocaleString(),
            this.roomId,
            this.ts
          );

          this.fetching = false;

          writer.destroy();

          // 防止因网络波动而 end 的情况
          this.loader();
        }
      } else {
        if (!this.timer) {
          // 停止推流后，但没有下播
          console.log(
            '[%s] %s: %s loader Interval',
            new Date().toLocaleString(),
            this.roomId,
            this.ts
          );

          this.fetching = false;

          this.timer = setInterval(() => {
            this.loader();
          }, 10 * 1000);
        }
      }
    } catch (err) {
      console.error(
        '[%s] %s: %s fetch catch error: %s',
        new Date().toLocaleString(),
        this.roomId,
        this.ts,
        err
      );

      this.fetching = false;

      if (!this.timer) {
        this.timer = setInterval(() => {
          this.loader();
        }, 10 * 1000);
      }
    }
  }

  /**
   * 设置 WebSocket 客户端
   * @param {Client} client - WebSocket 客户端
   */
  public set subClient(client: Client) {
    this.client = client;
  }

  private msgBody: any;

  /**
   * 处理 WebSocket 接收到的消息
   * @param {any} msgBody - 消息体
   */
  public async messageReceiver(msgBody: any) {
    const { op, cmd, body, ts } = msgBody;

    if (typeof body === 'string') {
      msgBody.body = JSON.parse(body);
    }

    // msgBody
    if (ts - (this.msgBody?.ts || ts) <= 70) {
      // 收到心跳时，判断在非串流时且目录已经创建超过 3600 秒
      if (op === 3 && !this.fetching && ts - this.recordTs > 3600) {
        // filename 不存在时，判断的是目录的修改时间
        // 串流后，判断的是 flv 的修改时间
        // mkdir 会清空 filename
        const file = await fs
          .stat(path.resolve(this.pwd, this.filename))
          .catch(() => null);

        if (file?.isFile()) {
          const mtime = Math.floor(file.mtimeMs / 1000);

          if (ts > mtime + 300) {
            // 收到心跳的时间戳大于 flv 文件最后修改时间 300 秒
            await this.mkdir(true);
          }
        } else {
          await this.mkdir(true);
        }
      }

      await fs.appendFile(
        path.resolve(this.pwd, 'sub.json'),
        `${JSON.stringify(msgBody)}\n`
      );
    } else {
      this.client?.close();
    }

    this.msgBody = msgBody;

    if (op === 3) {
      // 收到心跳判断是否开播，2023-08-30 起 body 恒定为 1
      // 防止未收到 LIVE cmd
      this.loader();
    } else if (op === 5) {
      switch (cmd) {
        case 'LIVE':
          // 开播 可以获取直播流
          // 切换 码率kbps 帧率fps 也会触发 LIVE
          this.loader();
          break;
        case 'PREPARING':
          // 闲置（下播）
          this.fetching = false;

          if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;

            console.log(
              '[%s] %s: %s PREPARING clear Interval',
              new Date().toLocaleString(),
              this.roomId,
              this.ts
            );
          }

          break;
        default:
          break;
      }
    }
  }
}

export default Recorder;
