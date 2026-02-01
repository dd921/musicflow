"""
Database module for MusicFlow application.
Supports both PostgreSQL (Supabase) and SQLite.
"""
import os
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse
import config

# Determine which database to use
USE_POSTGRES = bool(config.DATABASE_URL and config.DATABASE_URL.startswith('postgresql'))

if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor
else:
    import sqlite3


def get_db_connection():
    """Get a database connection."""
    if USE_POSTGRES:
        conn = psycopg2.connect(config.DATABASE_URL)
        return conn
    else:
        conn = sqlite3.connect(config.DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def get_cursor(conn):
    """Get a cursor with appropriate row factory."""
    if USE_POSTGRES:
        return conn.cursor(cursor_factory=RealDictCursor)
    else:
        return conn.cursor()


def placeholder():
    """Return the appropriate placeholder for the database."""
    return '%s' if USE_POSTGRES else '?'


def init_database():
    """
    Initialize the database schema.
    Creates users, oauth_tokens, and tracks tables if they don't exist.
    """
    conn = get_db_connection()
    cursor = get_cursor(conn)

    if USE_POSTGRES:
        # PostgreSQL schema
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                provider TEXT NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at BIGINT,
                scope TEXT,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, provider)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tracks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
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

        # Create indexes
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider
            ON oauth_tokens(user_id, provider)
        ''')
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

    else:
        # SQLite schema
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')

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

        # Create indexes
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider
            ON oauth_tokens(user_id, provider)
        ''')
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
    cursor.close()
    conn.close()

    # Migrate from old spotify_tracks.db if it exists (SQLite only)
    if not USE_POSTGRES:
        migrate_from_old_db()


def migrate_from_old_db():
    """Migrate data from old spotify_tracks.db to the new database."""
    old_db_path = 'spotify_tracks.db'

    if not os.path.exists(old_db_path) or old_db_path == config.DATABASE_PATH:
        return

    print(f"Found old database at {old_db_path}, migrating...")

    try:
        old_conn = sqlite3.connect(old_db_path)
        old_conn.row_factory = sqlite3.Row
        old_cursor = old_conn.cursor()

        old_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'")
        if not old_cursor.fetchone():
            old_conn.close()
            return

        old_cursor.execute('SELECT * FROM tracks')
        old_tracks = old_cursor.fetchall()

        if not old_tracks:
            old_conn.close()
            return

        new_conn = get_db_connection()
        new_cursor = get_cursor(new_conn)

        migrated_count = 0
        p = placeholder()
        for track in old_tracks:
            try:
                new_cursor.execute(f'''
                    INSERT INTO tracks
                    (track_id, track_name, artists, album, duration_ms, played_at, played_at_timestamp, stored_at)
                    VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})
                    ON CONFLICT DO NOTHING
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
                migrated_count += 1
            except Exception as e:
                print(f"Error migrating track: {e}")
                continue

        new_conn.commit()
        new_cursor.close()
        new_conn.close()
        old_conn.close()

        print(f"Migrated {migrated_count} tracks from old database.")

        backup_path = old_db_path + '.backup'
        os.rename(old_db_path, backup_path)
        print(f"Old database backed up to {backup_path}")

    except Exception as e:
        print(f"Error during migration: {e}")


def assign_legacy_tracks_to_user(user_id: int):
    """Assign tracks with NULL user_id to a specific user."""
    conn = get_db_connection()
    cursor = get_cursor(conn)

    p = placeholder()
    cursor.execute(f'UPDATE tracks SET user_id = {p} WHERE user_id IS NULL', (user_id,))

    if USE_POSTGRES:
        updated_count = cursor.rowcount
    else:
        updated_count = cursor.rowcount

    conn.commit()
    cursor.close()
    conn.close()

    return updated_count
