import 'server-only';
import { getSetting } from '../collect/run';

/** SNS投稿の設定（app_settings）。既定値は控えめにしておく */
export async function snsSettings() {
  return {
    dailyMax: Number(await getSetting('sns_daily_max', '5')) || 5,
    minIntervalMin: Number(await getSetting('sns_min_interval_min', '30')) || 0, // 0 = 間隔の制限なし
    liveMinUsers: Number(await getSetting('sns_live_min_users', '2')) || 2,
    liveGapMin: Number(await getSetting('sns_live_gap_min', '60')) || 60,
  };
}

