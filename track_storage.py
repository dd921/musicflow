"""
Storage module for persisting Spotify track data.
Handles deduplication and querying of historical track data.
"""
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pytz
from database import get_db_connection, get_cursor, placeholder, USE_POSTGRES


class TrackStorage:
    """Manages persistent storage of Spotify track data."""

    def __init__(self, user_id: Optional[int] = None):
        """
        Initialize track storage.

        Args:
            user_id: User ID for filtering tracks (None for legacy/global access)
        """
        self.user_id = user_id

    def store_tracks(self, tracks: List[Dict], user_id: Optional[int] = None) -> int:
        """
        Store tracks in the database with deduplication.

        Args:
            tracks: List of track dictionaries from Spotify API
            user_id: User ID to associate tracks with (uses self.user_id if not provided)

        Returns:
            Number of new tracks stored (after deduplication)
        """
        if not tracks:
            return 0

        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)

        stored_count = 0
        stored_at = datetime.now().isoformat()
        p = placeholder()

        for track in tracks:
            # Create unique key from track_id and played_at
            track_id = track.get('track_id')
            played_at = track.get('played_at')
            played_at_timestamp = track.get('played_at_timestamp')

            if not track_id or not played_at:
                continue

            # Convert timestamp to ISO string if it's a datetime object
            if isinstance(played_at_timestamp, datetime):
                played_at_timestamp_str = played_at_timestamp.isoformat()
            else:
                played_at_timestamp_str = str(played_at_timestamp)

            # Serialize artists list
            artists = json.dumps(track.get('artists', []))

            try:
                if USE_POSTGRES:
                    cursor.execute(f'''
                        INSERT INTO tracks
                        (user_id, track_id, track_name, artists, album, duration_ms,
                         played_at, played_at_timestamp, stored_at)
                        VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})
                        ON CONFLICT (user_id, track_id, played_at_timestamp) DO NOTHING
                    ''', (
                        uid,
                        track_id,
                        track.get('track_name', ''),
                        artists,
                        track.get('album', ''),
                        track.get('duration_ms', 0),
                        played_at,
                        played_at_timestamp_str,
                        stored_at
                    ))
                else:
                    cursor.execute(f'''
                        INSERT OR IGNORE INTO tracks
                        (user_id, track_id, track_name, artists, album, duration_ms,
                         played_at, played_at_timestamp, stored_at)
                        VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})
                    ''', (
                        uid,
                        track_id,
                        track.get('track_name', ''),
                        artists,
                        track.get('album', ''),
                        track.get('duration_ms', 0),
                        played_at,
                        played_at_timestamp_str,
                        stored_at
                    ))

                if cursor.rowcount > 0:
                    stored_count += 1
            except Exception as e:
                # Log error but continue with other tracks
                print(f"Error storing track: {e}")
                continue

        conn.commit()
        cursor.close()
        conn.close()

        return stored_count

    def get_tracks_in_range(self, start_time: datetime,
                            end_time: datetime, user_id: Optional[int] = None) -> List[Dict]:
        """
        Get all tracks that were playing during a time range.

        Args:
            start_time: Start of time range
            end_time: End of time range
            user_id: User ID to filter by (uses self.user_id if not provided)

        Returns:
            List of track dictionaries
        """
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)

        # Convert to ISO strings for comparison
        start_str = start_time.isoformat()
        end_str = end_time.isoformat()
        p = placeholder()

        # Query tracks that overlap with the time range
        # A track overlaps if: track_start <= range_end AND track_end >= range_start
        if USE_POSTGRES:
            if uid is not None:
                cursor.execute(f'''
                    SELECT * FROM tracks
                    WHERE (user_id = {p} OR user_id IS NULL)
                    AND played_at_timestamp <= {p}
                    AND (played_at_timestamp::timestamp + (duration_ms || ' milliseconds')::interval) >= {p}
                    ORDER BY played_at_timestamp ASC
                ''', (uid, end_str, start_str))
            else:
                cursor.execute(f'''
                    SELECT * FROM tracks
                    WHERE played_at_timestamp <= {p}
                    AND (played_at_timestamp::timestamp + (duration_ms || ' milliseconds')::interval) >= {p}
                    ORDER BY played_at_timestamp ASC
                ''', (end_str, start_str))
        else:
            if uid is not None:
                cursor.execute(f'''
                    SELECT * FROM tracks
                    WHERE (user_id = {p} OR user_id IS NULL)
                    AND played_at_timestamp <= {p}
                    AND datetime(played_at_timestamp, '+' || (duration_ms / 1000.0) || ' seconds') >= {p}
                    ORDER BY played_at_timestamp ASC
                ''', (uid, end_str, start_str))
            else:
                cursor.execute(f'''
                    SELECT * FROM tracks
                    WHERE played_at_timestamp <= {p}
                    AND datetime(played_at_timestamp, '+' || (duration_ms / 1000.0) || ' seconds') >= {p}
                    ORDER BY played_at_timestamp ASC
                ''', (end_str, start_str))

        rows = cursor.fetchall()
        tracks = []

        for row in rows:
            track = {
                'track_id': row['track_id'],
                'track_name': row['track_name'],
                'artists': json.loads(row['artists']),
                'album': row['album'],
                'duration_ms': row['duration_ms'],
                'played_at': row['played_at'],
                'played_at_timestamp': self._parse_timestamp(row['played_at_timestamp'])
            }
            tracks.append(track)

        cursor.close()
        conn.close()
        return tracks

    def get_all_tracks(self, limit: Optional[int] = None,
                      order_by: str = 'played_at_timestamp DESC',
                      user_id: Optional[int] = None) -> List[Dict]:
        """
        Get all stored tracks.

        Args:
            limit: Maximum number of tracks to return
            order_by: SQL ORDER BY clause
            user_id: User ID to filter by (uses self.user_id if not provided)

        Returns:
            List of track dictionaries
        """
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)
        p = placeholder()

        if uid is not None:
            query = f'SELECT * FROM tracks WHERE (user_id = {p} OR user_id IS NULL) ORDER BY {order_by}'
            params = [uid]
        else:
            query = f'SELECT * FROM tracks ORDER BY {order_by}'
            params = []

        if limit:
            query += f' LIMIT {limit}'

        cursor.execute(query, params)
        rows = cursor.fetchall()
        tracks = []

        for row in rows:
            track = {
                'track_id': row['track_id'],
                'track_name': row['track_name'],
                'artists': json.loads(row['artists']),
                'album': row['album'],
                'duration_ms': row['duration_ms'],
                'played_at': row['played_at'],
                'played_at_timestamp': self._parse_timestamp(row['played_at_timestamp'])
            }
            tracks.append(track)

        cursor.close()
        conn.close()
        return tracks

    def get_track_count(self, user_id: Optional[int] = None) -> int:
        """Get total number of stored tracks."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)
        p = placeholder()

        if uid is not None:
            cursor.execute(f'SELECT COUNT(*) as count FROM tracks WHERE (user_id = {p} OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT COUNT(*) as count FROM tracks')

        row = cursor.fetchone()
        count = row['count'] if USE_POSTGRES else row[0]
        cursor.close()
        conn.close()
        return count

    def get_oldest_track(self, user_id: Optional[int] = None) -> Optional[datetime]:
        """Get timestamp of oldest stored track."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)
        p = placeholder()

        if uid is not None:
            cursor.execute(f'SELECT MIN(played_at_timestamp) as min_ts FROM tracks WHERE (user_id = {p} OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT MIN(played_at_timestamp) as min_ts FROM tracks')

        row = cursor.fetchone()
        result = row['min_ts'] if USE_POSTGRES else row[0]
        cursor.close()
        conn.close()

        if result:
            return self._parse_timestamp(result)
        return None

    def get_newest_track(self, user_id: Optional[int] = None) -> Optional[datetime]:
        """Get timestamp of newest stored track."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = get_db_connection()
        cursor = get_cursor(conn)
        p = placeholder()

        if uid is not None:
            cursor.execute(f'SELECT MAX(played_at_timestamp) as max_ts FROM tracks WHERE (user_id = {p} OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT MAX(played_at_timestamp) as max_ts FROM tracks')

        row = cursor.fetchone()
        result = row['max_ts'] if USE_POSTGRES else row[0]
        cursor.close()
        conn.close()

        if result:
            return self._parse_timestamp(result)
        return None

    def cleanup_old_tracks(self, days_to_keep: int = 90, user_id: Optional[int] = None):
        """
        Remove tracks older than specified days.

        Args:
            days_to_keep: Number of days of history to keep
            user_id: User ID to filter by (uses self.user_id if not provided)
        """
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        cutoff_str = cutoff_date.isoformat()

        conn = get_db_connection()
        cursor = get_cursor(conn)
        p = placeholder()

        if uid is not None:
            cursor.execute(f'DELETE FROM tracks WHERE played_at_timestamp < {p} AND (user_id = {p} OR user_id IS NULL)',
                         (cutoff_str, uid))
        else:
            cursor.execute(f'DELETE FROM tracks WHERE played_at_timestamp < {p}', (cutoff_str,))

        deleted_count = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        return deleted_count

    def _parse_timestamp(self, timestamp_str: str) -> datetime:
        """Parse ISO timestamp string to datetime object."""
        try:
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            # Ensure timezone-aware
            if dt.tzinfo is None:
                dt = pytz.UTC.localize(dt)
            return dt
        except Exception:
            # Fallback parsing
            return datetime.strptime(timestamp_str.replace('Z', ''), '%Y-%m-%dT%H:%M:%S.%f')

    def sync_from_spotify(self, spotify_client, user_id: Optional[int] = None) -> Dict:
        """
        Fetch tracks from Spotify API and store them.

        Args:
            spotify_client: Authenticated SpotifyClient instance
            user_id: User ID to associate tracks with (uses self.user_id if not provided)

        Returns:
            Dictionary with sync statistics
        """
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        try:
            # Get all recently played tracks
            tracks = spotify_client.get_recently_played(limit=50)

            # Store them (deduplication happens automatically)
            stored_count = self.store_tracks(tracks, user_id=uid)

            return {
                'fetched': len(tracks),
                'stored': stored_count,
                'skipped': len(tracks) - stored_count,
                'total_in_db': self.get_track_count(user_id=uid)
            }
        except Exception as e:
            return {
                'error': str(e),
                'fetched': 0,
                'stored': 0
            }
