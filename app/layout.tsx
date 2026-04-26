import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NLumination — natural-language color grading",
  description:
    "Talk to your photos. NLumination turns plain-language prompts into pro-grade color edits, right in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorBackground: "#111114",
          colorInputBackground: "#0a0a0c",
          colorInputBorder: "#26262e",
          colorText: "#f5f5f7",
          colorTextSecondary: "#a1a1aa",
          colorPrimary: "#f97316",
          colorDanger: "#ef4444",
          colorSuccess: "#34d399",
          colorNeutral: "#a1a1aa",
          borderRadius: "0.875rem",
          fontFamily: "var(--font-geist-sans)",
        },
        elements: {
          rootBox: "w-full",
          card: "bg-[var(--color-bg-elev-1)] border border-[var(--color-border)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]",
          headerTitle: "text-[var(--color-fg)] tracking-tight",
          headerSubtitle: "text-[var(--color-fg-muted)]",
          socialButtonsBlockButton:
            "border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] text-[var(--color-fg)] hover:bg-[var(--color-bg-elev-3)] hover:border-[var(--color-border-strong)]",
          socialButtonsBlockButtonText: "text-[var(--color-fg)]",
          dividerLine: "bg-[var(--color-border)]",
          dividerText: "text-[var(--color-fg-dim)]",
          formFieldLabel: "text-[var(--color-fg-muted)]",
          formFieldInput:
            "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-fg)] focus:border-[var(--color-accent)]",
          formButtonPrimary:
            "bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] text-[var(--color-bg)] font-medium normal-case shadow-[0_0_24px_-6px_var(--color-accent-glow)] hover:opacity-95 transition",
          footerActionLink:
            "text-[var(--color-accent)] hover:text-[var(--color-accent-glow)]",
          identityPreviewEditButtonIcon: "text-[var(--color-accent)]",
          formFieldAction:
            "text-[var(--color-accent)] hover:text-[var(--color-accent-glow)]",
          otpCodeFieldInput:
            "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-fg)] focus:border-[var(--color-accent)]",
          userButtonPopoverCard:
            "bg-[var(--color-bg-elev-1)] border border-[var(--color-border)]",
          userButtonPopoverActionButton:
            "text-[var(--color-fg)] hover:bg-[var(--color-bg-elev-2)]",
        },
      }}
    >
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <div className="bg-waves" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
