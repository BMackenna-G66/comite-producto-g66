import { AppUser } from '../types';

export default function UserAvatar({ user, size = 'sm' }: { user: AppUser; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const initials = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return user.photoURL ? (
    <img src={user.photoURL} alt={user.name} className={`${s} rounded-full object-cover ring-2 ring-white`} referrerPolicy="no-referrer" />
  ) : (
    <div className={`${s} rounded-full bg-brand text-white flex items-center justify-center font-semibold`}>
      {initials}
    </div>
  );
}
