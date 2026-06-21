import { cn } from '@/lib/utils';

/** Distinct from guest circles — staff use squared gradient tiles with mono initials. */
const STAFF_GRADIENTS = [
  'from-slate-700 via-slate-800 to-neutral-900',
  'from-indigo-600 via-violet-600 to-purple-800',
  'from-teal-600 via-cyan-700 to-blue-800',
  'from-rose-600 via-orange-600 to-amber-700',
  'from-emerald-600 via-green-700 to-teal-800',
  'from-fuchsia-600 via-pink-600 to-rose-800',
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % STAFF_GRADIENTS.length;
  }
  return hash;
}

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function staffAvatarGradientClass(seed: string): string {
  return STAFF_GRADIENTS[hashSeed(seed)];
}

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-[10px] rounded-md',
  md: 'h-10 w-10 text-xs rounded-lg',
  lg: 'h-12 w-12 text-sm rounded-xl',
} as const;

interface StaffAvatarProps {
  name: string;
  seed: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export function StaffAvatar({ name, seed, size = 'md', className }: StaffAvatarProps) {
  const gradient = staffAvatarGradientClass(seed);
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-gradient-to-br font-mono font-bold text-white shadow-sm',
        'ring-1 ring-black/10 dark:ring-white/15',
        SIZE_CLASS[size],
        gradient,
        className
      )}
      aria-hidden
    >
      <span className="relative z-10 drop-shadow-sm">{staffInitials(name)}</span>
      <div
        className="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(135deg,rgba(255,255,255,0.35)_0%,transparent_45%,rgba(0,0,0,0.2)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 rounded-tl-md bg-white/20"
        aria-hidden
      />
    </div>
  );
}

export function formatStaffRoleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
