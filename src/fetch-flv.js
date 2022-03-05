const fetch = require('node-fetch');
const { getPlayUrl } = require('./get-info');

module.exports = async function (roomId) {
  let playUrl = await getPlayUrl(roomId);
  let sourceURL = playUrl.durl[0].url;

  let headers = new fetch.Headers({
    // (res.status === 475) means without Referer
    Referer: `https://live.bilibili.com/${roomId}`,
  });

  // only for test
  // sourceURL = 'http://localhost:8080/live/stream.flv';

  return fetch(sourceURL, {
    method: 'GET',
    headers,
    mode: 'cors',
    cache: 'default',
    referrerPolicy: 'no-referrer-when-downgrade',
  });
};
