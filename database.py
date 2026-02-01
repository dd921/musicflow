"""
Database module for MusicFlow application.
Handles database initialization and migrations for users, tokens, and tracks.
"""
import sqlite3
from datetime import datetime
from typing import Optional
import os
import config


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get a database connection with row factory enabled."""
    if db_path is None:
        db_path = config.DATABASE_PATH
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_database(db_path: Optional[str] = None):
    """
    Initialize the database schema.
    Creates users, oauth_tokens, and tracks tables if they don't exist.
    Handles migration from old spotify_tracks.db if needed.
    """
    if db_path is None:
        db_path = config.DATABASE_PATH

    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # Create oauth_tokens table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS oauth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at INTEGER,
            scope TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, provider)
        )
    ''')

    # Create index for faster token lookups
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider
        ON oauth_tokens(user_id, provider)
    ''')

    # Check if tracks table exists and needs migration
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'")
    tracks_exists = cursor.fetchone() is not None

    if tracks_exists:
        # Check if user_id column exists
        cursor.execute("PRAGMA table_info(tracks)")
        columns = [col[1] for col in cursor.fetchall()]

        if 'user_id' not in columns:
            # Need to migrate: add user_id column
            print("Migrating tracks table to add user_id support...")

            # Create new table with user_id
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
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    UNIQUE(user_id, track_id, played_at_timestamp)
                )
            ''')

            # Copy data from old table (user_id will be NULL for legacy data)
            cursor.execute('''
                INSERT INTO tracks_new
                (track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at)
                SELECT track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at
                FROM tracks
            ''')

            # Drop old table and rename new one
            cursor.execute('DROP TABLE tracks')
            cursor.execute('ALTER TABLE tracks_new RENAME TO tracks')

            print("Tracks table migration complete.")
    else:
        # Create tracks table with user_id support
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
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, track_id, played_at_timestamp)
            )
        ''')

    # Create indexes for tracks table
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_tracks_user_id
        ON tracks(user_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_tracks_played_at
        ON tracks(played_at_timestamp)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_tracks_track_id
        ON tracks(track_id)
    ''')

    conn.commit()
    conn.close()

    # Migrate data from old spotify_tracks.db if it exists
    migrate_from_old_db(db_path)


def migrate_from_old_db(new_db_path: str):
    """
    Migrate data from old spotify_tracks.db to the new database.
    """
    old_db_path = 'spotify_tracks.db'

    if not os.path.exists(old_db_path) or old_db_path == new_db_path:
        return

    print(f"Found old database at {old_db_path}, migrating...")

    try:
        old_conn = sqlite3.connect(old_db_path)
        old_conn.row_factory = sqlite3.Row
        old_cursor = old_conn.cursor()

        # Check if old tracks table exists
        old_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'")
        if not old_cursor.fetchone():
            old_conn.close()
            return

        # Get all tracks from old database
        old_cursor.execute('SELECT * FROM tracks')
        old_tracks = old_cursor.fetchall()

        if not old_tracks:
            old_conn.close()
            return

        # Insert into new database
        new_conn = get_db_connection(new_db_path)
        new_cursor = new_conn.cursor()

        migrated_count = 0
        for track in old_tracks:
            try:
                new_cursor.execute('''
                    INSERT OR IGNORE INTO tracks
                    (track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    track['track_id'],
                    track['track_name'],
                    track['artists'],
                    track['album'],
                    track['duration_ms'],
                    track['played_at'],
                    track['played_at_timestamp'],
                    track['stored_at']
                ))
                if new_cursor.rowcount > 0:
                    migrated_count += 1
            except Exception as e:
                print(f"Error migrating track: {e}")
                continue

        new_conn.commit()
        new_conn.close()
        old_conn.close()

        print(f"Migrated {migrated_count} tracks from old database.")

        # Rename old database to indicate it's been migrated
        backup_path = old_db_path + '.backup'
        os.rename(old_db_path, backup_path)
        print(f"Old database backed up to {backup_path}")

    except Exception as e:
        print(f"Error during migration: {e}")


def assign_legacy_tracks_to_user(user_id: int, db_path: Optional[str] = None):
    """
    Assign tracks with NULL user_id to a specific user.
    Useful for migrating existing data to the first user.
    """
    if db_path is None:
        db_path = config.DATABASE_PATH

    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE tracks SET user_id = ? WHERE user_id IS NULL
    ''', (user_id,))

    updated_count = cursor.rowcount
    conn.commit()
    conn.close()

    return updated_count
