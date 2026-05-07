import './globals.css';

export const metadata = { title: 'Shrew' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var pref = localStorage.getItem('shrew-theme-preference');
                  var root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  if (pref === 'dark') {
                    root.classList.add('dark');
                  } else if (pref === 'light') {
                    root.classList.add('light');
                  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    root.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans text-text-primary">
        {children}
      </body>
    </html>
  );
}
