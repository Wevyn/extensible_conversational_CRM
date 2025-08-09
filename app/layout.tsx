export const metadata = {
  title: "Attio Voice CRM",
  description: "Conversational CRM interface for Attio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav style={{ padding: 12, borderBottom: "1px solid #eee" }}>
          <a href="/" style={{ marginRight: 12 }}>
            Home
          </a>
          <a href="/settings">Settings</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
