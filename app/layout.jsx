export const metadata = {
  metadataBase: new URL('https://ai-meeting-assistant-wheat-seven.vercel.app'),
  title: {
    default: 'Minutes — AI Meeting Assistant',
    template: '%s | Minutes',
  },
  applicationName: 'Minutes',
  description: 'Turn meeting transcripts into evidence-backed decisions and action items.',
  keywords: ['AI meeting assistant', 'meeting minutes', 'action items', 'meeting decisions'],
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Minutes',
    title: 'Minutes — AI Meeting Assistant',
    description: 'Turn meeting transcripts into evidence-backed decisions and action items.',
    images: [{ url: '/demo.png', alt: 'Minutes AI Meeting Assistant interface' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Minutes — AI Meeting Assistant',
    description: 'Turn meeting transcripts into evidence-backed decisions and action items.',
    images: ['/demo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
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
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}