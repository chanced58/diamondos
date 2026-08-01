'use client';

export function PrintProfileButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 print:hidden"
    >
      Download / print PDF
    </button>
  );
}
