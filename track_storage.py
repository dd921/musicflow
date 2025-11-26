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


class TrackStorage:
    """Manages persistent storage of Spotify track data."""
    
    def __init__(self, db_path: str = "spotify_tracks.db"):
        """
        Initialize track storage.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
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
            
            # Create new table with correct schema
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracks_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artists TEXT NOT NULL,
                    album TEXT,
                    duration_ms INTEGER NOT NULL,
                    played_at TEXT NOT NULL,
                    played_at_timestamp TEXT NOT NULL,
                    stored_at TEXT NOT NULL,
                    UNIQUE(track_id, played_at_timestamp)
                )
            ''')
            
            # Copy data from old table
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
            # Create new table with correct schema
            # Deduplication is based on track_id + played_at_timestamp
            # This allows the same track to be stored multiple times if played at different times
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artists TEXT NOT NULL,
                    album TEXT,
                    duration_ms INTEGER NOT NULL,
                    played_at TEXT NOT NULL,
                    played_at_timestamp TEXT NOT NULL,
                    stored_at TEXT NOT NULL,
                    UNIQUE(track_id, played_at_timestamp)
                )
            ''')
        
        # Create index for faster queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_played_at 
            ON tracks(played_at_timestamp)
        ''')
        
        # Create index on track_id for faster lookups
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_track_id 
            ON tracks(track_id)
        ''')
        
        conn.commit()
        conn.close()
    
    def store_tracks(self, tracks: List[Dict]) -> int:
        """
        Store tracks in the database with deduplication.
        
        Args:
            tracks: List of track dictionaries from Spotify API
        
        Returns:
            Number of new tracks stored (after deduplication)
        """
        if not tracks:
            return 0
        
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
                    (track_id, track_name, artists, album, duration_ms, 
                     played_at, played_at_timestamp, stored_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
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
                            end_time: datetime) -> List[Dict]:
        """
        Get all tracks that were playing during a time range.
        
        Args:
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            List of track dictionaries
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Convert to ISO strings for comparison
        start_str = start_time.isoformat()
        end_str = end_time.isoformat()
        
        # Query tracks that overlap with the time range
        # A track overlaps if: track_start <= range_end AND track_end >= range_start
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
                      order_by: str = 'played_at_timestamp DESC') -> List[Dict]:
        """
        Get all stored tracks.
        
        Args:
            limit: Maximum number of tracks to return
            order_by: SQL ORDER BY clause
        
        Returns:
            List of track dictionaries
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = f'SELECT * FROM tracks ORDER BY {order_by}'
        if limit:
            query += f' LIMIT {limit}'
        
        cursor.execute(query)
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
    
    def get_track_count(self) -> int:
        """Get total number of stored tracks."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM tracks')
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
    def get_oldest_track(self) -> Optional[datetime]:
        """Get timestamp of oldest stored track."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT MIN(played_at_timestamp) FROM tracks')
        result = cursor.fetchone()[0]
        conn.close()
        
        if result:
            return self._parse_timestamp(result)
        return None
    
    def get_newest_track(self) -> Optional[datetime]:
        """Get timestamp of newest stored track."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT MAX(played_at_timestamp) FROM tracks')
        result = cursor.fetchone()[0]
        conn.close()
        
        if result:
            return self._parse_timestamp(result)
        return None
    
    def cleanup_old_tracks(self, days_to_keep: int = 90):
        """
        Remove tracks older than specified days.
        
        Args:
            days_to_keep: Number of days of history to keep
        """
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        cutoff_str = cutoff_date.isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
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
    
    def sync_from_spotify(self, spotify_client) -> Dict:
        """
        Fetch tracks from Spotify API and store them.
        
        Args:
            spotify_client: Authenticated SpotifyClient instance
        
        Returns:
            Dictionary with sync statistics
        """
        try:
            # Get all recently played tracks
            tracks = spotify_client.get_recently_played(limit=50)
            
            # Store them (deduplication happens automatically)
            stored_count = self.store_tracks(tracks)
            
            return {
                'fetched': len(tracks),
                'stored': stored_count,
                'skipped': len(tracks) - stored_count,
                'total_in_db': self.get_track_count()
            }
        except Exception as e:
            return {
                'error': str(e),
                'fetched': 0,
                'stored': 0
            }

