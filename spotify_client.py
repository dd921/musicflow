"""
Spotify API client for fetching listening history.
Handles authentication and rate limiting.
"""
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import config


class SpotifyClient:
    """Client for interacting with Spotify API."""
    
    def __init__(self, access_token: Optional[str] = None, 
                 refresh_token: Optional[str] = None):
        """
        Initialize Spotify client.
        
        Args:
            access_token: OAuth access token for Spotify API
            refresh_token: OAuth refresh token for Spotify API
        """
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.sp = None
        
        if access_token:
            self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Spotipy client with credentials."""
        if self.access_token:
            self.sp = spotipy.Spotify(auth=self.access_token)
    
    def update_token(self, access_token: str, refresh_token: Optional[str] = None):
        """Update access token and reinitialize client."""
        self.access_token = access_token
        if refresh_token:
            self.refresh_token = refresh_token
        self._initialize_client()
    
    def get_authorization_url(self) -> str:
        """Generate Spotify OAuth authorization URL."""
        scope = "user-read-recently-played user-read-playback-state user-read-currently-playing"
        
        sp_oauth = SpotifyOAuth(
            client_id=config.SPOTIFY_CLIENT_ID,
            client_secret=config.SPOTIFY_CLIENT_SECRET,
            redirect_uri=config.SPOTIFY_REDIRECT_URI,
            scope=scope,
            cache_path=None  # We'll handle token caching ourselves
        )
        
        auth_url = sp_oauth.get_authorize_url()
        return auth_url
    
    def exchange_code_for_token(self, code: str) -> Dict:
        """Exchange authorization code for access token."""
        sp_oauth = SpotifyOAuth(
            client_id=config.SPOTIFY_CLIENT_ID,
            client_secret=config.SPOTIFY_CLIENT_SECRET,
            redirect_uri=config.SPOTIFY_REDIRECT_URI,
            scope="user-read-recently-played user-read-playback-state user-read-currently-playing",
            cache_path=None
        )
        
        token_info = sp_oauth.get_access_token(code)
        return token_info
    
    def get_recently_played(self, limit: int = 50, 
                           before: Optional[datetime] = None,
                           after: Optional[datetime] = None) -> List[Dict]:
        """
        Get recently played tracks.
        
        Note: Spotify API limitations:
        - Maximum 50 tracks per request
        - Only provides last ~50 tracks total
        - Timestamps are in milliseconds since epoch
        
        Args:
            limit: Number of tracks to retrieve (max 50)
            before: Get tracks before this timestamp (datetime)
            after: Get tracks after this timestamp (datetime)
        
        Returns:
            List of recently played track dictionaries
        """
        if not self.sp:
            raise ValueError("Spotify client not initialized. Please authenticate first.")
        
        # Convert datetime to milliseconds timestamp
        params = {'limit': min(limit, 50)}
        
        if before:
            params['before'] = int(before.timestamp() * 1000)
        if after:
            params['after'] = int(after.timestamp() * 1000)
        
        try:
            results = self.sp.current_user_recently_played(**params)
            tracks = []
            
            for item in results.get('items', []):
                track_data = {
                    'track_id': item['track']['id'],
                    'track_name': item['track']['name'],
                    'artists': [artist['name'] for artist in item['track']['artists']],
                    'album': item['track']['album']['name'],
                    'duration_ms': item['track']['duration_ms'],
                    'played_at': item['played_at'],  # ISO 8601 format string
                    'played_at_timestamp': self._parse_iso_timestamp(item['played_at'])
                }
                tracks.append(track_data)
            
            return tracks
        
        except Exception as e:
            raise Exception(f"Error fetching recently played tracks: {str(e)}")
    
    def _parse_iso_timestamp(self, iso_string: str) -> datetime:
        """Parse ISO 8601 timestamp string to datetime object."""
        # Spotify returns timestamps like "2024-01-15T10:30:00.000Z"
        try:
            # Remove 'Z' and parse
            if iso_string.endswith('Z'):
                iso_string = iso_string[:-1] + '+00:00'
            return datetime.fromisoformat(iso_string)
        except Exception:
            # Fallback parsing
            return datetime.strptime(iso_string.replace('Z', ''), '%Y-%m-%dT%H:%M:%S.%f')
    
    def get_currently_playing(self) -> Optional[Dict]:
        """
        Get currently playing track (if any).
        
        Returns:
            Dictionary with current track info or None if nothing playing
        """
        if not self.sp:
            raise ValueError("Spotify client not initialized. Please authenticate first.")
        
        try:
            current = self.sp.current_user_playing_track()
            if current and current.get('is_playing'):
                item = current.get('item')
                if item:
                    progress_ms = current.get('progress_ms', 0)
                    return {
                        'track_id': item['id'],
                        'track_name': item['name'],
                        'artists': [artist['name'] for artist in item['artists']],
                        'album': item['album']['name'],
                        'duration_ms': item['duration_ms'],
                        'progress_ms': progress_ms,
                        'is_playing': True
                    }
        except Exception as e:
            # Silently fail if no track is playing
            pass
        
        return None
    
    def get_playback_state(self) -> Optional[Dict]:
        """
        Get current playback state.
        
        Returns:
            Dictionary with playback state or None
        """
        if not self.sp:
            raise ValueError("Spotify client not initialized. Please authenticate first.")
        
        try:
            state = self.sp.current_playback()
            return state
        except Exception:
            return None

