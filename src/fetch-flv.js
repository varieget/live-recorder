import fetch, { Headers } from 'node-fetch';
import { getPlayUrl } from './get-info.js';

export default async function (roomId) {
  let playUrl = await getPlayUrl(roomId);
  let sourceURL = playUrl.durl[0].url;

  let headers = new Headers({
    // (res.status === 475) means without Referer
    Referer: `https://live.bilibili.com/${roomId}`,
  });

  // sourceURL = 'http://localhost:8080/live/stream.flv';

  return fetch(sourceURL, {
    method: 'GET',
    headers,
    mode: 'cors',
    cache: 'default',
    referrerPolicy: 'no-referrer-when-downgrade',
  });
}
