import React from 'react';
import Link from 'next/link';

export default function Header({ title }) {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-indigo-600 hover:text-indigo-700">
            MediaValet Tools
          </Link>
          {title && (
            <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          )}
        </div>
      </div>
    </header>
  );
}