import type { NextConfig } from 'next';

// En Docker/Coolify el backend corre como contenedor separado.
// BACKEND_URL se configura como variable de entorno en Coolify.
// En desarrollo local sigue apuntando a localhost:3001.
const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  // Habilitar output standalone para el Dockerfile (imagen minima sin node_modules)
  output: 'standalone',

  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
