'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialDate: string;
}

export function BullpenDateControl({ initialDate }: Props): JSX.Element {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);

  function handleChange(next: string) {
    setDate(next);
    router.push(`/bullpen?date=${next}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>Target date</span>
      <input
        type="date"
        value={date}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm"
      />
    </label>
  );
}
