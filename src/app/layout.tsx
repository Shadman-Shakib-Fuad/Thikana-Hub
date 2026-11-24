import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/context/AuthContext";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ThikanaHub | Intelligent Address Resolution",
    template: "%s | ThikanaHub",
  },

  description:
    "ThikanaHub is an intelligent and secure Bangla address resolution platform for Bangladesh.",

  applicationName: "ThikanaHub",

  keywords: [
    "ThikanaHub",
    "Bangladesh",
    "Bangla Address",
    "Address Resolution",
    "Address Matching",
    "Secure Address Platform",
  ],

  authors: [
    {
      name: "Md Shadman Shakib Fuad",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased">

        <AuthProvider>
          {children}
        </AuthProvider>

      </body>
    </html>
  );

}