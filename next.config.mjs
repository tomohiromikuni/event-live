/** @type {import('next').NextConfig} */
const nextConfig = {
  // DBドライバはバンドルせず node_modules から読み込む（PGlite は wasm ファイルを使うため）
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};
export default nextConfig;
