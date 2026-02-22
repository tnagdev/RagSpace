import { UserProfile } from './UserAvatar';
import { Settings } from 'lucide-react';
import { IconButton } from './IconButton';
import { SceneSpotlight } from './SceneSpotlight';
import { useNavigate } from '@tanstack/react-router';

interface HeaderProps {
  className?: string;
}

export default function Header({ className }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <>
      <header className={`h-16 px-6 flex items-center justify-between bg-header-bg text-white border-b border-header-border ${className}`}>
        {/* Scene Spotlight */}
        <div className="flex-1 min-w-0">
          <SceneSpotlight />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4 ml-6">
          {/* Shortcuts/Actions */}
          <div className="flex items-center gap-2">
            {/* <IconButton
              variant="ghost"
              size="md"
              badge={true}
              icon={<Bell className="w-5 h-5" />}
              title="Notifications"
            /> */}
            <IconButton
              variant="ghost"
              size="md"
              icon={<Settings className="w-5 h-5" />}
              title="Settings"
              onClick={() => navigate({ to: '/settings' })}
            />
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-header-border"></div>

          {/* User Profile */}
          <UserProfile />
        </div>
      </header>
    </>
  );
}
