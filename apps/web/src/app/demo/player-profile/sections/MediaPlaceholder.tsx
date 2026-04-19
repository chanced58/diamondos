import type { JSX } from 'react';

export function MediaPlaceholder(): JSX.Element {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Highlights &amp; gallery</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Placeholder
          title="Highlight videos"
          message="Coming soon — video uploads are in development. Players will be able to attach game film and short reels recruiters can stream directly from the profile."
          icon={
            <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          }
        />
        <Placeholder
          title="Photo gallery"
          message="Coming soon — photo uploads are in development. Action shots, team photos, and event images will live here."
          icon={
            <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          }
        />
      </div>
    </section>
  );
}

interface PlaceholderProps {
  title: string;
  message: string;
  icon: JSX.Element;
}

function Placeholder({ title, message, icon }: PlaceholderProps): JSX.Element {
  return (
    <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center text-center">
      <div className="text-gray-400 mb-3">{icon}</div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">{message}</p>
    </div>
  );
}
