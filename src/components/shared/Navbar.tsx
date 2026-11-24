"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Menu,
  X,
  ArrowUpRight,
} from "lucide-react";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Features", href: "/#features" },
  { name: "How It Works", href: "/#how-it-works" },
  { name: "Security", href: "/#security" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">

      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">

        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-3"
          onClick={() => setIsOpen(false)}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-200">
            <MapPin size={25} strokeWidth={2.5} />
          </div>

          <div>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              Thikana<span className="text-emerald-700">Hub</span>
            </p>

            <p className="text-[10px] font-semibold tracking-widest text-slate-500">
              INTELLIGENT ADDRESS PLATFORM
            </p>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-8 lg:flex">

          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-semibold text-slate-600 transition-colors hover:text-emerald-700"
            >
              {link.name}
            </Link>
          ))}

        </div>

        {/* Desktop Button */}
        <Link
          href="/#preview"
          className="hidden items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 lg:flex"
        >
          Explore Platform
          <ArrowUpRight size={17} />
        </Link>

        {/* Mobile Menu Button */}
        <button
          type="button"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-xl border border-slate-200 p-3 text-slate-700 lg:hidden"
        >
          {isOpen ? <X size={23} /> : <Menu size={23} />}
        </button>

      </nav>

      {/* Mobile Navigation */}
      {isOpen && (
        <div
          id="mobile-navigation"
          className="border-t border-slate-200 bg-white p-5 lg:hidden"
        >

          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="block rounded-xl px-4 py-3 font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
            >
              {link.name}
            </Link>
          ))}

          <Link
            href="/#preview"
            onClick={() => setIsOpen(false)}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-4 font-semibold text-white"
          >
            Explore Platform
            <ArrowUpRight size={18} />
          </Link>

        </div>
      )}

    </header>
  );
}