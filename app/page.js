import Link from 'next/link';
import { Download, ArrowRight } from 'lucide-react';
import Header from "./components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-6">
              <Download className="w-10 h-10 text-indigo-600" />
            </div>
            
            <h1 className="text-3xl font-bold text-gray-800 mb-4">
              Welcome to MediaValet Tools
            </h1>
            
            <p className="text-gray-600 mb-8">
              Export and manage your MediaValet assets with ease.
            </p>
            
            <Link 
              href="/exporter"
              className="inline-flex items-center justify-center w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition duration-200 space-x-2"
            >
              <span>Go to Asset Exporter</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
