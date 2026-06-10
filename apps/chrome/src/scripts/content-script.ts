import { YouTubeMusicDetector } from '../utils/youtube-music-detector';
import { WebSocketManager } from '../utils/websocket-manager';
import type { TrackInfo } from '../types/metadata';

class YouTubeMusicContentScript {
  private lastTrackId: string | null = null;
  private lastIsPlaying: boolean | null = null;
  private lastPlaylist: string | null | undefined = undefined;
  private updateInterval: number | null = null;
  private periodicUpdateInterval: number | null = null;
  private wsManager: WebSocketManager | null = null;
  private showPlaylistEnabled: boolean = true;
  private debugModeEnabled: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    // Initialize WebSocket manager
    this.wsManager = new WebSocketManager();

    // Set up WebSocket status monitoring
    this.setupWebSocketStatusMonitoring();

    // Load playlist setting from storage on init
    chrome.storage.sync.get(['showPlaylistEnabled', 'debugModeEnabled'], (result) => {
      this.showPlaylistEnabled = result.showPlaylistEnabled ?? true;
      this.debugModeEnabled = result.debugModeEnabled ?? false;
      YouTubeMusicDetector.DEBUG_MODE = this.debugModeEnabled;
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Start monitoring for track changes
    this.startTrackMonitoring();
  }

  private setupWebSocketStatusMonitoring() {
    if (!this.wsManager) return;

    // Monitor WebSocket connection status and notify popup
    const checkStatus = () => {
      const status = this.wsManager?.getConnectionState() || 'disconnected';
      chrome.runtime.sendMessage({
        type: 'CONNECTION_STATUS_UPDATE',
        status: status,
      });
    };

    // Check status every 2 seconds
    setInterval(checkStatus, 2000);

    // Initial status check
    checkStatus();
  }

  private handleMessage(
    message: { type: string; enabled?: boolean },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) {
    try {
      switch (message.type) {
        case 'GET_CURRENT_TRACK': {
          const trackInfo = this.getCurrentTrackInfo();
          sendResponse(trackInfo);
          break;
        }

        case 'GET_METADATA': {
          const metadata = YouTubeMusicDetector.extractMetadata();
          if (!this.showPlaylistEnabled) {
            metadata.playlist = null;
          }
          sendResponse(metadata);
          break;
        }

        case 'GET_CONNECTION_STATUS': {
          const status = this.wsManager?.getConnectionState() || 'disconnected';
          sendResponse({ status });
          break;
        }

        case 'DISCORD_RPC_TOGGLE': {
          if (this.wsManager && this.wsManager.isConnected()) {
            const eventType = message.enabled ? 'TURN_ON' : 'TURN_OFF';
            this.wsManager.sendEvent({
              event: eventType as 'TURN_ON' | 'TURN_OFF',
              metadata: {
                author: '',
                url: '',
                title: '',
                totalDuration: 0,
                currentDuration: 0,
                image: null,
                artistUrl: null,
                playlist: null,
              },
            });
          }
          sendResponse({ success: true });
          break;
        }

        case 'SHOW_PLAYLIST_TOGGLE': {
          this.showPlaylistEnabled = message.enabled ?? true;
          const trackInfo = this.getCurrentTrackInfo();
          if (this.wsManager && this.wsManager.isConnected()) {
            this.wsManager.sendEvent({
              event: 'track',
              metadata: trackInfo.metadata,
            });
          }
          sendResponse({ success: true });
          break;
        }

        case 'DEBUG_MODE_TOGGLE': {
          this.debugModeEnabled = message.enabled ?? false;
          YouTubeMusicDetector.DEBUG_MODE = this.debugModeEnabled;
          sendResponse({ success: true });
          break;
        }

        case 'RECONNECT_WEBSOCKET': {
          if (this.wsManager) {
            this.wsManager.forceReconnect();
          }
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch {
      sendResponse({
        error: 'Failed to process request',
        metadata: {
          author: '',
          url: window.location.href,
          title: '',
          totalDuration: 0,
          currentDuration: 0,
          image: null,
          playlist: null,
        },
        isPlaying: false,
        timestamp: Date.now(),
      });
    }
  }

  private startTrackMonitoring() {
    // Check for track changes every 500ms for more responsive updates
    this.updateInterval = window.setInterval(() => {
      this.checkForTrackChanges();
    }, 500);

    // Send periodic track updates every 5 seconds
    this.periodicUpdateInterval = window.setInterval(() => {
      this.sendPeriodicTrackUpdate();
    }, 5000);

    // Also listen for DOM changes that might indicate track changes
    this.observePlayerChanges();
  }

  private checkForTrackChanges() {
    const trackInfo = this.getCurrentTrackInfo();
    const { isPlaying } = trackInfo;

    const currentTrackId = YouTubeMusicDetector.getCurrentTrackId();
    const hasTrackChanged =
      currentTrackId && currentTrackId !== this.lastTrackId;
    const hasPlayStateChanged =
      this.lastIsPlaying !== null && this.lastIsPlaying !== isPlaying;
    const hasPlaylistChanged =
      trackInfo.metadata.playlist !== this.lastPlaylist;

    // Update last known states
    if (currentTrackId) {
      this.lastTrackId = currentTrackId;
    }
    this.lastIsPlaying = isPlaying;
    this.lastPlaylist = trackInfo.metadata.playlist;

    // Only send real-time update to popup when actual changes occur
    if (hasTrackChanged || hasPlayStateChanged || hasPlaylistChanged) {
      if (hasTrackChanged) {
        if (this.debugModeEnabled) {
          console.log('YTMPX - Track Changed:', trackInfo.metadata.title);
          console.log('YTMPX - Playlist:', trackInfo.metadata.playlist);
        }
      } else if (hasPlaylistChanged) {
        if (this.debugModeEnabled) {
          console.log('YTMPX - Playlist Updated:', trackInfo.metadata.playlist);
        }
      }

      chrome.runtime.sendMessage({
        type: 'TRACK_UPDATE',
        trackInfo: trackInfo,
      });
    }

    // Send track changes to WebSocket
    if (hasTrackChanged || hasPlayStateChanged || hasPlaylistChanged) {
      if (this.wsManager) {
        this.wsManager.checkForTrackChanges(
          trackInfo.metadata,
          trackInfo.isPlaying
        );
      }
    }
  }

  private observePlayerChanges() {
    const playerElement = document.querySelector('ytmusic-player-bar');
    if (playerElement) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' || mutation.type === 'attributes') {
            // Check for changes when DOM updates
            setTimeout(() => {
              this.checkForTrackChanges();
            }, 100);
          }
        });
      });

      observer.observe(playerElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-valuenow', 'aria-valuemax', 'aria-label', 'href'],
      });
    }
  }

  private sendPeriodicTrackUpdate() {
    const trackInfo = this.getCurrentTrackInfo();
    const { isPlaying } = trackInfo;

    // Send periodic update to WebSocket to keep Discord in sync
    if (this.wsManager) {
      const eventType = isPlaying ? 'resume' : 'pause';
      this.wsManager.sendEvent({
        event: eventType,
        metadata: trackInfo.metadata,
      });
    }
  }

  private getCurrentTrackInfo(): TrackInfo {
    const metadata = YouTubeMusicDetector.extractMetadata();
    if (!this.showPlaylistEnabled) {
      metadata.playlist = null;
    }
    const isPlaying = YouTubeMusicDetector.isPlaying();

    return {
      metadata,
      isPlaying,
      timestamp: Date.now(),
    };
  }

  public destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
    }
    if (this.wsManager) {
      this.wsManager.destroy();
      this.wsManager = null;
    }
  }
}

// Initialize the content script
new YouTubeMusicContentScript();
