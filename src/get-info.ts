import fetch, { Headers } from 'node-fetch';

import type WbiSign from './wbiSign.ts';

type Result<T> = {
  code: number;
  message: string;
  ttl: number;
  data?: T;
};

const headers = new Headers({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
  Referer: 'https://live.bilibili.com/',
});

export const getWbiKeys = async () => {
  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers,
  });

  if (res.ok) {
    let { data } = (await res.json()) as Result<{
      wbi_img: { img_url: string; sub_url: string };
    }>;

    const {
      wbi_img: { img_url, sub_url },
    } = data!;

    return {
      img_key: img_url.slice(
        img_url.lastIndexOf('/') + 1,
        img_url.lastIndexOf('.')
      ),
      sub_key: sub_url.slice(
        sub_url.lastIndexOf('/') + 1,
        sub_url.lastIndexOf('.')
      ),
    };
  } else {
    return {};
  }
};

export const getBuvid = async () => {
  const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi');

  if (res.ok) {
    const { code, data } = (await res.json()) as Result<any>;
    if (code !== 0) throw new Error();

    return data;
  } else {
    return {};
  }
};

export const getDanmuInfo = async (
  roomId: number,
  wbi: WbiSign,
  b_3: string
) => {
  headers.append('cookie', `buvid3=${b_3};`);

  const res = await fetch(
    wbi.sign(
      'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo',
      { id: '' + roomId, type: '0' }
    ),
    { headers }
  );

  if (res.ok) {
    const { code, data } = (await res.json()) as Result<any>;
    if (code !== 0) throw new Error();

    return data;
  } else {
    return {};
  }
};

export const getInfoByRoom = async (roomId: number, wbi: WbiSign) => {
  const res = await fetch(
    wbi.sign(
      'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom',
      { room_id: '' + roomId }
    ),
    { headers }
  );

  if (res.ok) {
    const { code, data } = (await res.json()) as Result<any>;
    if (code !== 0) throw new Error();

    return data;
  } else {
    return {};
  }
};

export const getPlayUrl = async (roomId: number, wbi: WbiSign) => {
  const res = await fetch(
    wbi.sign('https://api.live.bilibili.com/room/v1/Room/playUrl', {
      cid: '' + roomId,
      quality: '4',
      platform: 'web',
    }),
    { headers }
  );

  if (res.ok) {
    const { code, data } = (await res.json()) as Result<any>;
    if (code !== 0) throw new Error();

    return data;
  } else {
    return {};
  }
};
