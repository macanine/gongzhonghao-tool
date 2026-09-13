import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PDF 解析、画布渲染、打包全部在浏览器里完成，没有任何服务端逻辑，
  // 所以直接导出静态站点：既能 `npm run build` 出纯静态文件，也保住了
  // 「文件不离开这台机器」的隐私前提。
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
