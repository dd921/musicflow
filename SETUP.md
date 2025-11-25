# Setup Instructions

## Environment Variables

Create a `.env` file in the project root with the following variables:

```
# Strava API Credentials
# Get these from https://www.strava.com/settings/api
STRAVA_CLIENT_ID=105395
STRAVA_CLIENT_SECRET=acdc07c3510c25aaf4259f4b9b1fe49bb1fb2dae
STRAVA_REDIRECT_URI=http://localhost:5500/strava/callback

# Spotify API Credentials
# Get these from https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5500/spotify/callback

# Flask Configuration
SECRET_KEY=your-secret-key-here-change-in-production
FLASK_ENV=development
```

## Getting API Credentials

### Strava
1. Go to https://www.strava.com/settings/api
2. Create a new application (or edit existing one)
3. **IMPORTANT**: Set the Authorization Callback Domain to `localhost:5500`
   - The full redirect URI should be: `http://localhost:5500/strava/callback`
4. Copy the Client ID and Client Secret

### Spotify
1. Go to https://developer.spotify.com/dashboard
2. Create a new app (or edit existing one)
3. **IMPORTANT**: Add `http://localhost:5500/spotify/callback` to Redirect URIs
   - Click "Edit Settings" on your app
   - Under "Redirect URIs", add: `http://localhost:5500/spotify/callback`
   - Make sure to save the changes
4. Copy the Client ID and Client Secret

**Note**: If you previously configured these apps with port 5000, you MUST update the redirect URIs in both dashboards to use port 5500, otherwise authentication will fail.

## Running the Application

### (Optional) Create a Conda environment

```bash
conda create -n musicflow python=3.11 -y
conda activate musicflow
pip install -r requirements.txt
```

If you already have an env, just ensure it runs Python 3.8+ before installing deps.

1. Install dependencies: `pip install -r requirements.txt`
2. Create `.env` file with your credentials
3. Run: `python app.py`
4. Open http://localhost:5500 in your browser

