"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const linkClass = (path: string) =>
    `px-3 py-1.5 rounded-md text-sm font-medium ${
      pathname === path
        ? "bg-neutral-900 text-white"
        : "text-neutral-600 hover:bg-neutral-200"
    }`;

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-neutral-900">
          Paper Worthy Photo Catalog
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/" className={linkClass("/")}>
            Gallery
          </Link>
          <Link href="/import" className={linkClass("/import")}>
            Import
          </Link>
          <button
            onClick={handleLogout}
            className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-neutral-500 hover:bg-neutral-200"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
