const { TextEncoder, TextDecoder } = require('util');
const WebSocket = require('ws');
const zlib = require('zlib');

const packetOffset = 0; // 数据包
const headerOffset = 4; // 数据包头部
const rawHeaderLen = 16; // 数据包头部长度（固定为 16）
const verOffset = 6; // 协议版本
const opOffset = 8; // 操作类型
const seqOffset = 12; // 数据包头部

class Client {
  constructor(options) {
    const MAX_CONNECT_TIMES = 10; // 最多重试次数
    const DELAY = 15000; // 重试间隔

    const defaultOptions = {
      roomId: 1,
      log: () => {},
    };

    this.options = { ...defaultOptions, ...options };

    this.textDecoder = new TextDecoder('utf-8');
    this.textEncoder = new TextEncoder('utf-8');

    this.connect(MAX_CONNECT_TIMES, DELAY);
  }

  connect(max, delay) {
    let self = this;
    if (max === 0) return;

    const ws = new WebSocket('wss://broadcastlv.chat.bilibili.com:2245/sub');
    ws.binaryType = 'arraybuffer';

    const { roomId, log } = self.options;

    ws.on('open', function () {
      log('auth start');

      const token = JSON.stringify({
        roomid: roomId,
        protover: 2,
        platform: 'web',
      });

      ws.send(self.convertToArrayBuffer(token, 7));
    });

    let heartbeatInterval;

    ws.on('message', function (data) {
      const dataView = new DataView(data, 0);

      const ts = Math.floor(Date.now() / 1000);

      const { body, packetLen, headerLen, ver, op, seq } = self.convertToObject(
        data
      );

      if (op !== 3 && op !== 5) {
        log('receiveHeader:', { packetLen, headerLen, ver, op, seq, body });
      }

      switch (op) {
        case 8:
          // 进房
          // send heartbeat
          heartbeatInterval = setInterval(function () {
            ws.send(self.convertToArrayBuffer({}, 2));

            log('send: heartbeat;');
          }, 30 * 1000);
          break;
        case 3:
          // 人气
          // heartbeat reply
          log('receive: heartbeat;', { online: body.count });

          // callback
          self.messageReceived(ver, op, body.count, ts);
          break;
        case 5:
          // batch message
          for (
            let offset = 0, packetLen, body;
            offset < data.byteLength;
            offset += packetLen
          ) {
            // parse
            packetLen = dataView.getInt32(offset);
            const headerLen = dataView.getInt16(offset + headerOffset);
            const ver = dataView.getInt16(offset + verOffset);

            // callback
            try {
              if (ver === 2) {
                // 2020-04-10 开始全面压缩
                const msgBody = data.slice(
                  offset + headerLen,
                  offset + packetLen
                );
                const bufBody = zlib.inflateSync(new Uint8Array(msgBody));

                body = self.convertToObject(bufBody.buffer).body;
              } else {
                body = self.textDecoder.decode(
                  data.slice(offset + headerLen, offset + packetLen)
                );
              }

              self.messageReceived(ver, op, JSON.parse(body), ts);

              log('messageReceived:', { ver, body });
            } catch (e) {
              console.error('decode body error:', e);
            }
          }

          break;
      }
    });

    ws.on('close', function () {
      log('closed');

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      setTimeout(reConnect, delay);
    });

    ws.on('error', function (e) {
      console.error(e);
    });

    const reConnect = () => self.connect(--max, delay * 2);
  }

  messageReceived(ver, op, body, ts) {
    let cmd = body.cmd;
    let notify = this.options.notify;

    if (notify) {
      notify({
        ver,
        op,
        ...(cmd ? { cmd } : {}),
        body,
        ts,
      });
    }
  }

  convertToObject(data) {
    // decode
    const dataView = new DataView(data, 0);
    const packetLen = dataView.getInt32(packetOffset);
    const headerLen = dataView.getInt16(headerOffset);
    const ver = dataView.getInt16(verOffset);
    const op = dataView.getInt32(opOffset);
    const seq = dataView.getInt32(seqOffset);
    const msgBody = this.textDecoder.decode(data.slice(headerLen, packetLen));

    let result = { body: msgBody, packetLen, headerLen, ver, op, seq };

    if (op === 3) {
      result.body = {
        count: dataView.getInt32(rawHeaderLen),
      };
    }

    return result;
  }

  convertToArrayBuffer(token = '', op) {
    // encode
    const headerBuf = new ArrayBuffer(rawHeaderLen);
    const headerView = new DataView(headerBuf, 0);
    const bodyBuf = this.textEncoder.encode(token);

    headerView.setInt32(packetOffset, rawHeaderLen + bodyBuf.byteLength); // 数据包长度
    headerView.setInt16(headerOffset, rawHeaderLen);
    headerView.setInt16(verOffset, 1); // 协议版本 为1
    headerView.setInt32(opOffset, op); // op 操作码
    headerView.setInt32(seqOffset, 1); // 数据包头部长度（固定为 1）

    return this.mergeArrayBuffer(headerBuf, bodyBuf);
  }

  mergeArrayBuffer(ab1, ab2) {
    const u81 = new Uint8Array(ab1),
      u82 = new Uint8Array(ab2),
      res = new Uint8Array(ab1.byteLength + ab2.byteLength);

    res.set(u81, 0);
    res.set(u82, ab1.byteLength);

    return res.buffer;
  }
}

module.exports = Client;
