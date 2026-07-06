import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utilitaire standard shadcn/ui pour fusionner les classes Tailwind conditionnelles.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
