"use client";

import Link from "next/link";

interface DashboardCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

export default function DashboardCard({ title, description, href, icon }: DashboardCardProps) {
  return (
    <Link href={href}>
      <div className="ba-card hover:shadow-lg transition-shadow cursor-pointer group h-full">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-ba-light flex items-center justify-center text-ba-navy group-hover:bg-ba-navy group-hover:text-white transition-colors flex-shrink-0">
            {icon}
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-ba-navy mb-1">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
