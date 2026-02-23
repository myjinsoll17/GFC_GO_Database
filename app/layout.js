export const metadata = {
  title: "Excel Data Viewer",
  description: "Search and download filtered Excel data",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        {children}
      </body>
    </html>
  );
}
