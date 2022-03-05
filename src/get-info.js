const querystring = require('querystring');
const fetch = require('node-fetch');

module.exports = {
  getInfoByRoom: async (roomId) => {
    // https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=8592153

    try {
      let res = await fetch(
        `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`
      );

      if (res.ok) {
        let { data } = await res.json();

        return data;
      } else {
        return {};
      }
    } catch (e) {
        console.error(e);

      return {};
    }
  },
  getPlayUrl: async (roomId) => {
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
        let { data } = await res.json();

        return data;
      } else {
        return {};
      }
    } catch (e) {
      console.error(e);

      return {};
    }
  },
};
