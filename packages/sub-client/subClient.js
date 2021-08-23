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
      console: true,
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

    ws.on('open', function () {
      if (self.options.console) {
        console.log('auth start');
      }

      ws.send(
        self.convertToArrayBuffer(
          JSON.stringify({
            roomid: self.options.roomId,
            protover: 2,
            platform: 'web',
          }),
          7
        )
      );
    });

    let heartbeatInterval;

    ws.on('message', function (data) {
      let dataView = new DataView(data, 0);

      let ts = Math.floor(Date.now() / 1000);

      let { body, packetLen, headerLen, ver, op, seq } = self.convertToObject(
        data
      );

      if (self.options.console) {
        if (op !== 3 && op !== 5)
          console.log(
            'receiveHeader:',
            'packetLen=' + packetLen,
            'headerLen=' + headerLen,
            'ver=' + ver,
            'op=' + op,
            'seq=' + seq,
            'body=' + body
          );
      }

      switch (op) {
        case 8:
          // 进房
          // send heartbeat
          heartbeatInterval = setInterval(function () {
            ws.send(self.convertToArrayBuffer({}, 2));

            if (self.options.console) {
              console.log('send: heartbeat');
            }
          }, 30 * 1000);
          break;
        case 3:
          // 人气
          // heartbeat reply
          if (self.options.console) {
            console.log('receive: heartbeat; online=', body.count);
          }

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
            let headerLen = dataView.getInt16(offset + headerOffset);
            let ver = dataView.getInt16(offset + verOffset);

            // callback
            try {
              if (ver === 2) {
                // 2020-04-10 开始全面压缩
                let msgBody = data.slice(
                  offset + headerLen,
                  offset + packetLen
                );
                let bufBody = zlib.inflateSync(new Uint8Array(msgBody));

                body = self.convertToObject(bufBody.buffer).body;
              } else {
                body = self.textDecoder.decode(
                  data.slice(offset + headerLen, offset + packetLen)
                );
              }

              self.messageReceived(ver, op, JSON.parse(body), ts);

              if (self.options.console) {
                console.log('messageReceived:', 'ver=' + ver, 'body=' + body);
              }
            } catch (e) {
              console.error('decode body error:', e);
            }
          }

          break;
      }
    });

    ws.on('close', function () {
      if (self.options.console) {
        console.log('closed');
      }

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
    let dataView = new DataView(data, 0);
    let packetLen = dataView.getInt32(packetOffset);
    let headerLen = dataView.getInt16(headerOffset);
    let ver = dataView.getInt16(verOffset);
    let op = dataView.getInt32(opOffset);
    let seq = dataView.getInt32(seqOffset);
    let msgBody = this.textDecoder.decode(data.slice(headerLen, packetLen));

    let result = {
      body: msgBody,
      packetLen,
      headerLen,
      ver,
      op,
      seq,
    };

    if (op === 3) {
      result.body = {
        count: dataView.getInt32(rawHeaderLen),
      };
    }

    return result;
  }

  convertToArrayBuffer(token = '', op) {
    // encode
    let headerBuf = new ArrayBuffer(rawHeaderLen);
    let headerView = new DataView(headerBuf, 0);
    let bodyBuf = this.textEncoder.encode(token);

    headerView.setInt32(packetOffset, rawHeaderLen + bodyBuf.byteLength); // 数据包长度
    headerView.setInt16(headerOffset, rawHeaderLen);
    headerView.setInt16(verOffset, 1); // 协议版本 为1
    headerView.setInt32(opOffset, op); // op 操作码
    headerView.setInt32(seqOffset, 1); // 数据包头部长度（固定为 1）

    return this.mergeArrayBuffer(headerBuf, bodyBuf);
  }

  mergeArrayBuffer(ab1, ab2) {
    let u81 = new Uint8Array(ab1),
      u82 = new Uint8Array(ab2),
      res = new Uint8Array(ab1.byteLength + ab2.byteLength);

    res.set(u81, 0);
    res.set(u82, ab1.byteLength);

    return res.buffer;
  }
}

module.exports = Client;
