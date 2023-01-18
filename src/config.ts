import { cosmiconfigSync } from 'cosmiconfig';

const explorerSync = cosmiconfigSync('recorder');
const result = explorerSync.search();

// roomId 短位号
export const config = result?.config.roomId as number[];
