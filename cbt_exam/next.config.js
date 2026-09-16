/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Applies to every route.
        source: "/:path*",
        headers: [
          // Prevents the site being framed by another origin (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops the browser guessing content types away from what's declared.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Limits how much referrer info leaks to other origins on navigation.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No third-party site should be able to use this device's camera/mic
          // via this origin — only this origin's own exam pages request them.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
