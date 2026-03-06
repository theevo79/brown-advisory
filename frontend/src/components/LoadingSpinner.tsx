"use client";

export default function LoadingSpinner({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-ba-navy border-t-transparent rounded-full animate-spin mb-3"></div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
