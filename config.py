"""
Configuration file for MusicFlow application.
Store your API credentials in a .env file in the project root.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Environment detection
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
IS_PRODUCTION = FLASK_ENV == 'production'

# Base URL for constructing redirect URIs
BASE_URL = os.getenv('BASE_URL', 'http://127.0.0.1:5500')

# Strava API Configuration
STRAVA_CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
STRAVA_CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
STRAVA_REDIRECT_URI = os.getenv('STRAVA_REDIRECT_URI', f"{BASE_URL}/strava/callback")

# Spotify API Configuration
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', f"{BASE_URL}/spotify/callback")

# Flask Configuration
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

# Require SECRET_KEY in production
if IS_PRODUCTION and SECRET_KEY == 'dev-secret-key-change-in-production':
    raise ValueError("SECRET_KEY must be set to a secure value in production!")

# Database Configuration
DATABASE_PATH = os.getenv('DATABASE_PATH', 'musicflow.db')

# API Rate Limits (requests per 15 minutes)
STRAVA_RATE_LIMIT = 600  # Strava allows 600 requests per 15 minutes
SPOTIFY_RATE_LIMIT = 1000  # Spotify allows 1000 requests per 15 minutes

# Data History Limits
STRAVA_HISTORY_DAYS = 30  # Strava API typically provides last 30 days of detailed data
SPOTIFY_HISTORY_DAYS = 50  # Spotify Recently Played API provides last 50 tracks

# Token refresh buffer (refresh if expires in less than this many seconds)
TOKEN_REFRESH_BUFFER = 300  # 5 minutes

