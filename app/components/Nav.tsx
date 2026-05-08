"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const links = [{ href: "/rag", label: "RAG Light" }];

  return (
    <nav className="pl-5">
      {pathname !== "/" && (
        <Link href="/">
          <h1 className="font-semibold tracking-tight text-2xl">The Garden</h1>
        </Link>
      )}
      {links.map((link, index) => (
        <Link key={index} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
