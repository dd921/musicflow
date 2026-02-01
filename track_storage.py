"""
Storage module for persisting Spotify track data.
Handles deduplication and querying of historical track data.
"""
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from pathlib import Path
import pytz
import config


class TrackStorage:
    """Manages persistent storage of Spotify track data."""

    def __init__(self, db_path: Optional[str] = None, user_id: Optional[int] = None):
        """
        Initialize track storage.

        Args:
            db_path: Path to SQLite database file
            user_id: User ID for filtering tracks (None for legacy/global access)
        """
        self.db_path = db_path or config.DATABASE_PATH
        self.user_id = user_id
        self._init_database()
    
    def _init_database(self):
        """Initialize the database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Check if the old schema exists (with track_id as primary key only)
        # If so, we need to migrate to the new schema
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='tracks'")
        result = cursor.fetchone()

        if result and 'track_id TEXT PRIMARY KEY' in result[0] and 'id INTEGER PRIMARY KEY' not in result[0]:
            # Old schema detected - need to migrate
            print("Migrating database schema to support same track at different times...")

            # Create new table with correct schema including user_id
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracks_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artists TEXT NOT NULL,
                    album TEXT,
                    duration_ms INTEGER NOT NULL,
                    played_at TEXT NOT NULL,
                    played_at_timestamp TEXT NOT NULL,
                    stored_at TEXT NOT NULL,
                    UNIQUE(user_id, track_id, played_at_timestamp)
                )
            ''')

            # Copy data from old table (user_id will be NULL for legacy data)
            cursor.execute('''
                INSERT OR IGNORE INTO tracks_new
                (track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at)
                SELECT track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at
                FROM tracks
            ''')

            # Drop old table and rename new one
            cursor.execute('DROP TABLE tracks')
            cursor.execute('ALTER TABLE tracks_new RENAME TO tracks')

            print("Database migration complete.")
        elif not result:
            # Create new table with correct schema including user_id
            # Deduplication is based on user_id + track_id + played_at_timestamp
            # This allows the same track to be stored multiple times if played at different times
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artists TEXT NOT NULL,
                    album TEXT,
                    duration_ms INTEGER NOT NULL,
                    played_at TEXT NOT NULL,
                    played_at_timestamp TEXT NOT NULL,
                    stored_at TEXT NOT NULL,
                    UNIQUE(user_id, track_id, played_at_timestamp)
                )
            ''')
        else:
            # Check if user_id column exists
            cursor.execute("PRAGMA table_info(tracks)")
            columns = [col[1] for col in cursor.fetchall()]
            if 'user_id' not in columns:
                # Add user_id column to existing table
                print("Adding user_id column to tracks table...")
                cursor.execute('ALTER TABLE tracks ADD COLUMN user_id INTEGER')
                print("Column added.")

        # Create indexes for faster queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_played_at
            ON tracks(played_at_timestamp)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_track_id
            ON tracks(track_id)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_id
            ON tracks(user_id)
        ''')

        conn.commit()
        conn.close()
    
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

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        stored_count = 0
        stored_at = datetime.now().isoformat()

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
                cursor.execute('''
                    INSERT OR IGNORE INTO tracks
                    (user_id, track_id, track_name, artists, album, duration_ms,
                     played_at, played_at_timestamp, stored_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            except sqlite3.IntegrityError:
                # Duplicate, skip
                pass

        conn.commit()
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

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Convert to ISO strings for comparison
        start_str = start_time.isoformat()
        end_str = end_time.isoformat()

        # Query tracks that overlap with the time range
        # A track overlaps if: track_start <= range_end AND track_end >= range_start
        if uid is not None:
            cursor.execute('''
                SELECT * FROM tracks
                WHERE (user_id = ? OR user_id IS NULL)
                AND played_at_timestamp <= ?
                AND datetime(played_at_timestamp, '+' || (duration_ms / 1000.0) || ' seconds') >= ?
                ORDER BY played_at_timestamp ASC
            ''', (uid, end_str, start_str))
        else:
            cursor.execute('''
                SELECT * FROM tracks
                WHERE played_at_timestamp <= ?
                AND datetime(played_at_timestamp, '+' || (duration_ms / 1000.0) || ' seconds') >= ?
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

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if uid is not None:
            query = f'SELECT * FROM tracks WHERE (user_id = ? OR user_id IS NULL) ORDER BY {order_by}'
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

        conn.close()
        return tracks
    
    def get_track_count(self, user_id: Optional[int] = None) -> int:
        """Get total number of stored tracks."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if uid is not None:
            cursor.execute('SELECT COUNT(*) FROM tracks WHERE (user_id = ? OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT COUNT(*) FROM tracks')

        count = cursor.fetchone()[0]
        conn.close()
        return count

    def get_oldest_track(self, user_id: Optional[int] = None) -> Optional[datetime]:
        """Get timestamp of oldest stored track."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if uid is not None:
            cursor.execute('SELECT MIN(played_at_timestamp) FROM tracks WHERE (user_id = ? OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT MIN(played_at_timestamp) FROM tracks')

        result = cursor.fetchone()[0]
        conn.close()

        if result:
            return self._parse_timestamp(result)
        return None

    def get_newest_track(self, user_id: Optional[int] = None) -> Optional[datetime]:
        """Get timestamp of newest stored track."""
        # Use provided user_id or fall back to instance user_id
        uid = user_id if user_id is not None else self.user_id

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if uid is not None:
            cursor.execute('SELECT MAX(played_at_timestamp) FROM tracks WHERE (user_id = ? OR user_id IS NULL)', (uid,))
        else:
            cursor.execute('SELECT MAX(played_at_timestamp) FROM tracks')

        result = cursor.fetchone()[0]
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

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if uid is not None:
            cursor.execute('DELETE FROM tracks WHERE played_at_timestamp < ? AND (user_id = ? OR user_id IS NULL)',
                         (cutoff_str, uid))
        else:
            cursor.execute('DELETE FROM tracks WHERE played_at_timestamp < ?', (cutoff_str,))

        deleted_count = cursor.rowcount
        conn.commit()
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

