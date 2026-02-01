# MusicFlow 🎵

A Python web application that combines Strava workout data with Spotify listening history to create interactive charts showing which songs were playing during different parts of your workout.

## Features

- **Strava Integration**: Fetch your workout activities and detailed metrics (pace, heart rate, cadence, power, altitude)
- **Spotify Integration**: Retrieve your recently played tracks and align them with workout timelines
- **Persistent Track Storage**: Automatically stores Spotify tracks in SQLite database to overcome API limitations
- **Deduplication**: Automatically prevents duplicate tracks from being stored
- **Interactive Charts**: Beautiful, interactive visualizations powered by Plotly
- **Time Alignment**: Properly handles timestamps and timezones to accurately match music with workout segments
- **Unit & Timezone Controls**: Toggle between metric/imperial units and convert to different timezones
- **Data Smoothing**: Apply smoothing to metrics (Heart Rate, Pace, Cadence, Power, Altitude)
- **Multi-User Support**: Data isolation for multiple users
- **Modern UI**: Dark/light theme with sidebar navigation

## Prerequisites

- Python 3.8 or higher
- Strava API credentials ([Get them here](https://www.strava.com/settings/api))
- Spotify API credentials ([Get them here](https://developer.spotify.com/dashboard))

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd musicflow
```

### 2. Set Up Python Environment

**Option A: Using Conda (Recommended)**

```bash
conda create -n musicflow python=3.11 -y
conda activate musicflow
pip install -r requirements.txt
```

**Option B: Using venv**

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Get API Credentials

#### Strava API Setup

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application (or edit existing one)
3. **IMPORTANT**: Set the Authorization Callback Domain to `localhost:5500`
   - The full redirect URI should be: `http://localhost:5500/strava/callback`
4. Copy the **Client ID** and **Client Secret**

#### Spotify API Setup

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app (or edit existing one)
3. **IMPORTANT**: Add the redirect URI to your app settings:
   - Click "Edit Settings" on your app
   - Under "Redirect URIs", add: `http://127.0.0.1:5500/spotify/callback`
   - **Note**: Spotify no longer allows `localhost` - you must use `127.0.0.1` instead
   - Make sure to save the changes
4. Copy the **Client ID** and **Client Secret**

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# On macOS/Linux
cat > .env << 'EOF'
# Strava API Credentials
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_REDIRECT_URI=http://localhost:5500/strava/callback

# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5500/spotify/callback

# Flask Configuration
SECRET_KEY=your-secret-key-here-change-in-production
FLASK_ENV=development
EOF
```

**Or manually create `.env` with the following content:**

```
# Strava API Credentials
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_REDIRECT_URI=http://localhost:5500/strava/callback

# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5500/spotify/callback

# Flask Configuration
SECRET_KEY=your-secret-key-here-change-in-production
FLASK_ENV=development
```

Replace the placeholder values with your actual API credentials.

### 5. Run the Application

Make sure your environment is activated, then:

```bash
python app.py
```

The application will start on `http://localhost:5500`

### 6. Authenticate and Use

1. Open your browser and navigate to `http://localhost:5500`
2. **Connect Strava**: Click "Connect Strava" and authorize the application
3. **Connect Spotify**: Click "Connect Spotify" and authorize the application
4. **View Activities**: Browse your recent activities from the Activities page
5. **View Charts**: Click on any activity to see interactive charts with Spotify track overlays

## Usage Guide

### Dashboard

The home page shows connection status for both Strava and Spotify, with buttons to refresh data from each service.

### Activities Page

- View all your Strava activities sorted by date (newest first)
- See track counts for each activity
- Toggle between metric/imperial units
- Select your preferred timezone (EST, CST, PST, UTC)
- Click any activity card to view detailed metrics

### Activity Detail Page

- Interactive charts showing:
  - Heart Rate
  - Pace
  - Cadence
  - Power (if available)
  - Altitude
  - Track timeline
- Toggle smoothing for individual metrics
- Colored shading shows when tracks were playing
- Adjust units and timezone preferences

### Song History

View all stored Spotify tracks in the database, with statistics on total tracks stored.

## API Limitations

### Strava API
- Detailed activity stream data is typically available for the last **30 days**
- Rate limit: 600 requests per 15 minutes
- Some older activities may not have detailed stream data

### Spotify API
- Recently played tracks are limited to the last **~50 tracks** via API
- **Solution**: MusicFlow automatically stores all fetched tracks in a local SQLite database
- Tracks are deduplicated automatically, so you can sync regularly to build up history
- With persistent storage, you can match tracks with activities from any time period (as long as tracks were stored)
- For best results, sync tracks regularly or view activities to automatically store tracks

## Project Structure

```
musicflow/
├── app.py                 # Flask web application
├── config.py              # Configuration and environment variables
├── strava_client.py       # Strava API client
├── spotify_client.py      # Spotify API client
├── data_prep.py          # Data preparation, alignment, and smoothing
├── track_storage.py       # Persistent storage for Spotify tracks (SQLite)
├── plotting.py           # Chart creation and visualization
├── units.py              # Unit conversion utilities
├── formatting.py         # Data formatting utilities
├── requirements.txt      # Python dependencies
├── templates/            # HTML templates
│   ├── base.html
│   ├── index.html
│   ├── activities.html
│   ├── activity_detail.html
│   ├── activity_debug.html
│   ├── spotify_debug.html
│   └── spotify_storage.html
├── static/               # Static assets (CSS, JS)
├── spotify_tracks.db     # SQLite database (created automatically)
└── README.md
```

## Troubleshooting

### Port Already in Use

If port 5500 is already in use, you can change it in:
- `app.py` (update the port in the `if __name__ == '__main__'` block)
- `.env` file (update `STRAVA_REDIRECT_URI` and `SPOTIFY_REDIRECT_URI`)
- Update redirect URIs in both Strava and Spotify dashboards

### Authentication Errors

- **"INVALID_CLIENT: Invalid redirect URI"**: Make sure the redirect URI in your Spotify dashboard exactly matches `http://127.0.0.1:5500/spotify/callback` (use `127.0.0.1`, not `localhost`)
- **Strava redirect errors**: Ensure the callback domain in Strava settings is set to `localhost:5500`

### Module Not Found Errors

Make sure you've activated your environment and installed dependencies:
```bash
conda activate musicflow  # or: source venv/bin/activate
pip install -r requirements.txt
```

### No Tracks Showing on Activities

- Make sure you've authenticated with Spotify
- Use the refresh button to sync latest tracks
- Check the "Song History" page to see stored tracks
- Tracks are only matched if they were playing during the activity time

## Development

To run in development mode:

```bash
export FLASK_ENV=development
python app.py
```

## License

This project is provided as-is for personal use.

## Notes

- Make sure your Strava activities have detailed stream data enabled
- For best results, ensure Spotify was playing music during your workouts
- The application stores OAuth tokens in Flask sessions (in-memory)
- For production use, implement proper token storage and refresh logic
- Database files (`*.db`) are automatically ignored by git
