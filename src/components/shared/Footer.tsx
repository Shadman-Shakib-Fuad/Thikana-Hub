import BrandLogo from "@/components/branding/BrandLogo";
import Link from "next/link";
import {
  ShieldCheck,
  Globe2,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">

      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div>

            <Link href="/" className="inline-flex items-center gap-3">

              <BrandLogo variant="icon" decorative />

              <span className="text-2xl font-extrabold text-white">
                Thikana<span className="text-emerald-400">Hub</span>
              </span>

            </Link>

            <p className="mt-5 text-sm leading-7 text-slate-400">
              Intelligent address resolution designed
              for the people and businesses of Bangladesh.
            </p>

          </div>

          {/* Platform Links */}
          <div>

            <h3 className="mb-5 font-bold text-white">
              Platform
            </h3>

            <div className="space-y-3 text-sm">

              <Link href="/" className="block hover:text-emerald-400">
                Home
              </Link>

              <Link href="/#features" className="block hover:text-emerald-400">
                Features
              </Link>

              <Link href="/#how-it-works" className="block hover:text-emerald-400">
                How It Works
              </Link>

              <Link href="/#security" className="block hover:text-emerald-400">
                Security
              </Link>

            </div>

          </div>

          {/* Technology */}
          <div>

            <h3 className="mb-5 font-bold text-white">
              Technology
            </h3>

            <div className="space-y-3 text-sm text-slate-400">
              <p>Address Normalization</p>
              <p>Intelligent Matching</p>
              <p>Cryptography</p>
              <p>Web & Android</p>
            </div>

          </div>

          {/* Identity */}
          <div>

            <h3 className="mb-5 font-bold text-white">
              Built for Bangladesh
            </h3>

            <div className="space-y-4 text-sm text-slate-400">

              <p className="flex items-center gap-2">
                <Globe2 size={18} className="text-emerald-400" />
                Bangladesh
              </p>

              <p className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" />
                Privacy-first architecture
              </p>

              <p lang="bn" className="font-medium text-emerald-400">
                সঠিক ঠিকানা, সহজ সমাধান।
              </p>

            </div>

          </div>

        </div>

        {/* Bottom Footer */}
        <div className="mt-12 flex flex-col justify-between gap-4 border-t border-slate-800 pt-7 text-sm text-slate-400 sm:flex-row">

          <p>
            © {new Date().getFullYear()} ThikanaHub.
            All rights reserved.
          </p>

          <p>
            Designed & Developed by{" "}
            <span className="font-semibold text-emerald-400">
              Md Shadman Shakib Fuad
            </span>
          </p>

        </div>

      </div>

    </footer>
  );
}