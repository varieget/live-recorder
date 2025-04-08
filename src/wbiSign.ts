import md5 from 'md5';

class WbiSign {
  private get mixinKeyEncTab() {
    return [
      46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
      49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
      40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
      62, 11, 36, 20, 34, 44, 52,
    ];
  }

  private getMixinKey(orig: string) {
    return this.mixinKeyEncTab
      .map((n) => orig[n])
      .join('')
      .slice(0, 32);
  }

  constructor(
    protected img_key: string = '',
    protected sub_key: string = ''
  ) {}

  sign(url: URL | string, searchParams?: Record<string, string>) {
    const mixin_key = this.getMixinKey(this.img_key + this.sub_key);
    const wts = Math.round(Date.now() / 1000);

    if (typeof url == 'string') url = new URL(url);

    for (const name in searchParams) {
      url.searchParams.append(name, searchParams[name]);
    }

    url.searchParams.append('wts', wts.toString());
    url.searchParams.sort();

    url.searchParams.append(
      'w_rid',
      md5(url.searchParams.toString() + mixin_key)
    );

    return url.toJSON();
  }
}

export default WbiSign;
