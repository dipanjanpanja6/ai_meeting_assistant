/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // small self-contained server for the Docker image
  // Next's gzip middleware can hold back small SSE writes until the response ends; turn it off.
  compress: false,
  poweredByHeader: false,
  // The corpus is read from disk at runtime, so ship it with the server bundle.
  outputFileTracingIncludes: {
    '/ask': ['./corpus/**/*'],
    '/health': ['./corpus/**/*'],
  },
};

export default nextConfig;
