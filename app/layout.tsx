import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lora's Book Game",
  description: "Online playtest for Lora's card game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-900 text-stone-100">
        {children}
      </body>
    </html>
  );
}
