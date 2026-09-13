import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 交给 Vercel 原生 Next.js 构建器管理 `.next` 产物，避免手动指定
  // `out` 后触发 routes-manifest 路径冲突。应用仍然是本地浏览器工具，
  // 不会上传用户导入的 PDF。
  reactStrictMode: true,
};

export default nextConfig;
