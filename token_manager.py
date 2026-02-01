"""
Token manager for MusicFlow application.
Handles OAuth token storage, retrieval, and automatic refresh.
"""
import time
from datetime import datetime
from typing import Dict, Optional
import config
from database import get_db_connection


class TokenManager:
    """Manages OAuth tokens with automatic refresh."""

    def __init__(self, db_path: Optional[str] = None):
        """Initialize token manager."""
        self.db_path = db_path or config.DATABASE_PATH

    def get_token(self, user_id: int, provider: str) -> Optional[Dict]:
        """
        Get stored token for a user and provider.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'

        Returns:
            Token dictionary or None if not found
        """
        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT access_token, refresh_token, expires_at, scope, updated_at
            FROM oauth_tokens
            WHERE user_id = ? AND provider = ?
        ''', (user_id, provider))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return {
            'access_token': row['access_token'],
            'refresh_token': row['refresh_token'],
            'expires_at': row['expires_at'],
            'scope': row['scope'],
            'updated_at': row['updated_at']
        }

    def get_valid_token(self, user_id: int, provider: str) -> Optional[Dict]:
        """
        Get a valid token, refreshing if necessary.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'

        Returns:
            Valid token dictionary or None if refresh fails
        """
        token = self.get_token(user_id, provider)

        if not token:
            return None

        # Check if token needs refresh (expires within buffer time)
        if token['expires_at']:
            expires_at = token['expires_at']
            current_time = int(time.time())

            if expires_at - current_time < config.TOKEN_REFRESH_BUFFER:
                # Token expires soon, try to refresh
                if token['refresh_token']:
                    refreshed = self._refresh_token(user_id, provider, token)
                    if refreshed:
                        return refreshed

                # If refresh failed and token is already expired, return None
                if expires_at < current_time:
                    return None

        return token

    def store_token(self, user_id: int, provider: str, token_data: Dict):
        """
        Store or update a token for a user.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'
            token_data: Token data from OAuth flow
        """
        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()

        now = datetime.now().isoformat()

        # Extract token fields
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')
        expires_at = token_data.get('expires_at')
        scope = token_data.get('scope')

        # Handle expires_in if expires_at not provided
        if not expires_at and 'expires_in' in token_data:
            expires_at = int(time.time()) + token_data['expires_in']

        # Upsert token
        cursor.execute('''
            INSERT INTO oauth_tokens (user_id, provider, access_token, refresh_token, expires_at, scope, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
                expires_at = excluded.expires_at,
                scope = excluded.scope,
                updated_at = excluded.updated_at
        ''', (user_id, provider, access_token, refresh_token, expires_at, scope, now))

        conn.commit()
        conn.close()

    def delete_token(self, user_id: int, provider: str):
        """
        Delete a token for a user.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'
        """
        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?
        ''', (user_id, provider))

        conn.commit()
        conn.close()

    def delete_all_tokens(self, user_id: int):
        """
        Delete all tokens for a user.

        Args:
            user_id: The user's ID
        """
        conn = get_db_connection(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            DELETE FROM oauth_tokens WHERE user_id = ?
        ''', (user_id,))

        conn.commit()
        conn.close()

    def _refresh_token(self, user_id: int, provider: str, token: Dict) -> Optional[Dict]:
        """
        Refresh an expired token.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'
            token: Current token data

        Returns:
            New token data or None if refresh fails
        """
        try:
            if provider == 'strava':
                return self._refresh_strava_token(user_id, token)
            elif provider == 'spotify':
                return self._refresh_spotify_token(user_id, token)
            else:
                return None
        except Exception as e:
            print(f"Error refreshing {provider} token: {e}")
            return None

    def _refresh_strava_token(self, user_id: int, token: Dict) -> Optional[Dict]:
        """
        Refresh a Strava token.

        Args:
            user_id: The user's ID
            token: Current token data

        Returns:
            New token data or None if refresh fails
        """
        from strava_client import StravaClient

        if not token.get('refresh_token'):
            return None

        client = StravaClient()
        new_token_data = client.refresh_token(token['refresh_token'])

        # Store the new token
        self.store_token(user_id, 'strava', new_token_data)

        return {
            'access_token': new_token_data.get('access_token'),
            'refresh_token': new_token_data.get('refresh_token', token['refresh_token']),
            'expires_at': new_token_data.get('expires_at'),
            'scope': token.get('scope'),
            'updated_at': datetime.now().isoformat()
        }

    def _refresh_spotify_token(self, user_id: int, token: Dict) -> Optional[Dict]:
        """
        Refresh a Spotify token.

        Args:
            user_id: The user's ID
            token: Current token data

        Returns:
            New token data or None if refresh fails
        """
        from spotify_client import SpotifyClient

        if not token.get('refresh_token'):
            return None

        client = SpotifyClient()
        new_token_data = client.refresh_token(token['refresh_token'])

        # Store the new token
        self.store_token(user_id, 'spotify', new_token_data)

        return {
            'access_token': new_token_data.get('access_token'),
            'refresh_token': new_token_data.get('refresh_token', token['refresh_token']),
            'expires_at': new_token_data.get('expires_at'),
            'scope': token.get('scope'),
            'updated_at': datetime.now().isoformat()
        }

    def has_valid_token(self, user_id: int, provider: str) -> bool:
        """
        Check if a user has a valid (or refreshable) token.

        Args:
            user_id: The user's ID
            provider: 'strava' or 'spotify'

        Returns:
            True if user has a valid or refreshable token
        """
        token = self.get_token(user_id, provider)
        if not token:
            return False

        # If no expiry set, assume valid
        if not token['expires_at']:
            return True

        # Check if token is valid or has refresh token
        current_time = int(time.time())
        if token['expires_at'] > current_time:
            return True

        return token.get('refresh_token') is not None
