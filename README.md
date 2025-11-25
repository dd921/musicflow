# MusicFlow 🎵

A Python web application that combines Strava workout data with Spotify listening history to create interactive charts showing which songs were playing during different parts of your workout.

## Features

- **Strava Integration**: Fetch your workout activities and detailed metrics (pace, heart rate, cadence, power, altitude)
- **Spotify Integration**: Retrieve your recently played tracks and align them with workout timelines
- **Persistent Track Storage**: Automatically stores Spotify tracks in SQLite database to overcome API limitations
- **Deduplication**: Automatically prevents duplicate tracks from being stored
- **Interactive Charts**: Beautiful, interactive visualizations powered by Plotly
- **Time Alignment**: Properly handles timestamps and timezones to accurately match music with workout segments
- **API Limitations Handling**: Accounts for Strava and Spotify API history limitations

## Prerequisites

- Python 3.8 or higher
- Strava API credentials ([Get them here](https://www.strava.com/settings/api))
- Spotify API credentials ([Get them here](https://developer.spotify.com/dashboard))

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your API credentials:
     - `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`
     - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
     - `SECRET_KEY` (for Flask sessions)

4. Run the application:
```bash
python app.py
```

5. Open your browser and navigate to `http://localhost:5500`

## Usage

1. **Authenticate with Strava**: Click "Connect Strava" and authorize the application
2. **Authenticate with Spotify**: Click "Connect Spotify" and authorize the application
3. **View Activities**: Browse your recent activities (last 30 days)
4. **View Charts**: Click on any activity to see interactive charts with Spotify track overlays

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
├── data_prep.py          # Data preparation and alignment (timestamps, timezones)
├── track_storage.py      # Persistent storage for Spotify tracks (SQLite)
├── plotting.py           # Chart creation and visualization
├── requirements.txt      # Python dependencies
├── templates/            # HTML templates
│   ├── index.html
│   ├── activities.html
│   ├── activity_detail.html
│   ├── activity_debug.html
│   ├── spotify_debug.html
│   └── spotify_storage.html
├── spotify_tracks.db     # SQLite database (created automatically)
└── README.md
```

## Data Flow

1. **Authentication**: Users authenticate with both Strava and Spotify via OAuth
2. **Activity Fetching**: Strava activities are retrieved (last 30 days)
3. **Stream Data**: Detailed time-series data (pace, HR, etc.) is fetched for selected activity
4. **Track Fetching**: 
   - Spotify recently played tracks are retrieved from API
   - Tracks are automatically stored in local SQLite database (with deduplication)
   - Stored tracks are queried for activity time range
   - API and stored tracks are combined for comprehensive matching
5. **Time Alignment**: Tracks are aligned with activity timeline using timestamps and timezones
6. **Visualization**: Interactive charts are generated showing metrics with track overlays

## Track Storage

MusicFlow includes a persistent storage system to overcome Spotify's API limitations:

- **Automatic Storage**: Tracks are automatically saved when you view activities or sync manually
- **Deduplication**: Duplicate tracks (same track_id + played_at) are automatically skipped
- **Manual Sync**: Use the "View Stored Tracks" page to manually sync latest tracks from Spotify
- **Query by Time Range**: Stored tracks can be queried for any time period, not just recent 50 tracks
- **Database**: Uses SQLite (`spotify_tracks.db`) stored locally in the project directory

## Timezone Handling

The application properly handles timezones:
- Strava returns timestamps in UTC but includes activity timezone information
- Spotify returns timestamps in ISO 8601 format
- All timestamps are converted to timezone-aware datetime objects
- Tracks are matched to activity segments based on precise timestamp overlap

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

