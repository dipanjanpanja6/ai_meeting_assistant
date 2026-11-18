import './globals.css';

export const metadata = {
  title: {
    default: 'Trace — Streaming Research Assistant',
    template: '%s | Trace',
  },
  applicationName: 'Trace',
  description: 'Watch a research graph plan, search, write and cite, live over server-sent events.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export const viewport = {
  colorScheme: 'light',
  themeColor: '#f6f5f0',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
