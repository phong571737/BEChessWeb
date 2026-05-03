"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const links = [
  { href: "/",       label: "HOME"   },
  { href: "/played", label: "PLAYED" },
  { href: "/log",    label: "LOG"    },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm" style={{ height: "var(--header-h)" }}>
      <nav className="flex h-full items-center px-2 sm:px-4 gap-2 sm:gap-4 max-w-[1400px] mx-auto">

        {/* Mobile burger */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-sm transition-colors",
                pathname === href
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Brand */}
        <Link
          href="/"
          className="flex items-center ml-auto md:ml-0 md:absolute md:left-1/2 md:-translate-x-1/2"
        >
          <Image
            src="/images/logo.jpg"
            alt="TTLab Logo"
            width={36}
            height={36}
            className="rounded-sm"
            priority
          />
        </Link>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={toggle}
          title="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </nav>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-border bg-background px-4 py-2 flex flex-col gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "px-3 py-2 text-sm font-medium rounded-sm transition-colors",
                pathname === href
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
