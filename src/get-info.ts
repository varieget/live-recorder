import querystring from 'node:querystring';
import fetch from 'node-fetch';

type Result<T> = {
  code: number;
  message: string;
  ttl: number;
  data: T;
};

export const getInfoByRoom = async (roomId: number) => {
  // https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=8592153

  try {
    let res = await fetch(
      `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`
    );

    if (res.ok) {
      let { data } = (await res.json()) as Result<any>;

      return data;
    } else {
      return {};
    }
  } catch (e) {
    console.error(e);

    return {};
  }
};

export const getPlayUrl = async (roomId: number) => {
  // https://api.live.bilibili.com/room/v1/Room/playUrl?cid=8592153&quality=4&platform=web

  let cid = roomId;

  let params = {
    cid,
    quality: 4,
    platform: 'web',
  };

  try {
    let res = await fetch(
      `https://api.live.bilibili.com/room/v1/Room/playUrl?${querystring.stringify(
        params
      )}`
    );

    if (res.ok) {
      let { data } = (await res.json()) as Result<any>;

      return data;
    } else {
      return {};
    }
  } catch (e) {
    console.error(e);

    return {};
  }
};
