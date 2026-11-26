/** @type {import('next').NextConfig} */
const nextConfig = {
  // DBドライバはバンドルせず node_modules から読み込む（PGlite は wasm ファイルを使うため）
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // 管理画面からガイドマップ（画像・PDF）をアップロードするため（Vercel の上限 4.5MB の内側）
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
};
export default nextConfig;
