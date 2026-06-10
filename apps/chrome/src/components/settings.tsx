import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface SettingsProps {
  onDiscordRpcToggle?: (enabled: boolean) => void;
}

export const Settings: React.FC<SettingsProps> = ({ onDiscordRpcToggle }) => {
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState(false);
  const [showPlaylistEnabled, setShowPlaylistEnabled] = useState(true);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);

  useEffect(() => {
    // Load Discord RPC setting from storage
    chrome.storage.sync.get(['discordRpcEnabled', 'showPlaylistEnabled', 'debugModeEnabled'], (result) => {
      setDiscordRpcEnabled(result.discordRpcEnabled ?? false);
      setShowPlaylistEnabled(result.showPlaylistEnabled ?? true);
      setDebugModeEnabled(result.debugModeEnabled ?? false);
    });
  }, []);

  const handleDiscordRpcToggle = (enabled: boolean) => {
    setDiscordRpcEnabled(enabled);
    chrome.storage.sync.set({ discordRpcEnabled: enabled });

    // Send WebSocket event to content script
    chrome.runtime
      .sendMessage({
        type: 'DISCORD_RPC_TOGGLE',
        enabled: enabled,
      })
      .catch(() => {
        // Ignore errors if content script is not available
      });

    onDiscordRpcToggle?.(enabled);
  };

  const handleShowPlaylistToggle = (enabled: boolean) => {
    setShowPlaylistEnabled(enabled);
    chrome.storage.sync.set({ showPlaylistEnabled: enabled });

    chrome.runtime
      .sendMessage({
        type: 'SHOW_PLAYLIST_TOGGLE',
        enabled: enabled,
      })
      .catch(() => { });
  };

  const handleDebugModeToggle = (enabled: boolean) => {
    setDebugModeEnabled(enabled);
    chrome.storage.sync.set({ debugModeEnabled: enabled });

    chrome.runtime
      .sendMessage({
        type: 'DEBUG_MODE_TOGGLE',
        enabled: enabled,
      })
      .catch(() => { });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <SettingsIcon className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center justify-between">
          <div className="flex flex-col space-y-1">
            <Label htmlFor="discord-rpc" className="text-sm font-medium">
              Discord RPC
            </Label>
            <p className="text-xs text-muted-foreground">
              Show current track in Discord
            </p>
          </div>
          <Switch
            id="discord-rpc"
            checked={discordRpcEnabled}
            onCheckedChange={handleDiscordRpcToggle}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center justify-between">
          <div className="flex flex-col space-y-1">
            <Label htmlFor="show-playlist" className="text-sm font-medium">
              Show Playlist
            </Label>
            <p className="text-xs text-muted-foreground">
              Display playlist name in Discord
            </p>
          </div>
          <Switch
            id="show-playlist"
            checked={showPlaylistEnabled}
            onCheckedChange={handleShowPlaylistToggle}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center justify-between">
          <div className="flex flex-col space-y-1">
            <Label htmlFor="debug-mode" className="text-sm font-medium">
              Debug Logs
            </Label>
            <p className="text-xs text-muted-foreground">
              Print diagnostic info to console
            </p>
          </div>
          <Switch
            id="debug-mode"
            checked={debugModeEnabled}
            onCheckedChange={handleDebugModeToggle}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
