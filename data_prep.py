"""
Data preparation module for aligning Strava activity data with Spotify listening history.
Handles timestamps, timezones, and API limitations.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import pytz
from strava_client import StravaClient
from spotify_client import SpotifyClient
from track_storage import TrackStorage


class DataPreparator:
    """Prepares and aligns Strava and Spotify data for visualization."""
    
    def __init__(self, strava_client: StravaClient, spotify_client: SpotifyClient,
                 track_storage: Optional[TrackStorage] = None):
        """
        Initialize data preparator.
        
        Args:
            strava_client: Authenticated Strava client
            spotify_client: Authenticated Spotify client
            track_storage: Optional TrackStorage instance for persistent storage
        """
        self.strava_client = strava_client
        self.spotify_client = spotify_client
        self.track_storage = track_storage or TrackStorage()
    
    def get_activity_with_streams(self, activity_id: int) -> Tuple[Dict, Dict]:
        """
        Get activity details and streams.
        
        Returns:
            Tuple of (activity_details, streams_dict)
        """
        activity = self.strava_client.get_activity(activity_id)
        
        # Validate activity is a dict
        if not isinstance(activity, dict):
            raise ValueError(f"Expected activity to be a dict, got {type(activity)}: {activity}")
        
        streams = self.strava_client.get_activity_streams(
            activity_id,
            types=['time', 'distance', 'heartrate', 'velocity_smooth', 
                   'cadence', 'altitude', 'watts', 'temp']
        )
        
        # Validate streams is a dict
        if not isinstance(streams, dict):
            raise ValueError(f"Expected streams to be a dict, got {type(streams)}: {streams}")
        
        return activity, streams
    
    def prepare_activity_dataframe(self, activity: Dict, streams: Dict) -> pd.DataFrame:
        """
        Convert activity streams to pandas DataFrame with proper timestamps.
        
        Args:
            activity: Activity details dictionary
            streams: Streams dictionary from Strava API
        
        Returns:
            DataFrame with time-aligned metrics
        """
        # Get activity start time and timezone
        start_time_str = activity.get('start_date')
        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        
        # Strava returns times in UTC, but activity may have timezone info
        timezone_str = activity.get('timezone', 'UTC')
        try:
            tz = pytz.timezone(timezone_str)
            # Convert UTC start time to activity timezone
            start_time = start_time.astimezone(tz)
        except:
            tz = pytz.UTC
        
        # Get time stream (elapsed time in seconds)
        # Handle case where streams might have different structure
        time_stream_data = streams.get('time')
        if isinstance(time_stream_data, dict):
            time_stream = time_stream_data.get('data', [])
        elif isinstance(time_stream_data, list):
            time_stream = time_stream_data
        else:
            time_stream = []
        
        if not time_stream:
            raise ValueError("No time stream data available for this activity")
        
        # Create DataFrame
        data = {'elapsed_time': time_stream}
        
        # Helper function to safely get stream data
        def get_stream_data(stream_name):
            stream_obj = streams.get(stream_name)
            if isinstance(stream_obj, dict):
                return stream_obj.get('data', [])
            elif isinstance(stream_obj, list):
                return stream_obj
            return None
        
        # Add distance if available (in meters)
        distance_data = get_stream_data('distance')
        if distance_data:
            data['distance_m'] = distance_data
            # Also calculate in miles for imperial units (meters to km, then km to miles)
            from units import UnitConverter
            data['distance_miles'] = [UnitConverter.km_to_miles(d / 1000.0) if d else None for d in distance_data]
        
        # Add heart rate if available
        hr_data = get_stream_data('heartrate')
        if hr_data:
            data['heartrate'] = hr_data
        
        # Add pace (minutes per km) from velocity
        # Strava API: velocity_smooth is in meters per second (m/s)
        velocity_data = get_stream_data('velocity_smooth')
        if velocity_data:
            velocity = velocity_data  # m/s
            
            # Calculate pace (min/km) from velocity (m/s)
            # Pace = time to cover 1 km
            # Time to cover 1000m = 1000 / v seconds
            # Time to cover 1 km = (1000 / v) / 60 minutes = 1000 / (v * 60) minutes
            pace_km = [1000 / (v * 60) if v > 0 else None for v in velocity]
            data['pace_min_per_km'] = pace_km
            
            # Also calculate pace in min/mile for imperial units
            # 1 mile = 1.60934 km, so pace in min/mile = pace in min/km * 1.60934
            from units import UnitConverter
            data['pace_min_per_mile'] = [UnitConverter.pace_km_to_mile(p) if p else None for p in pace_km]
            
            # Speed in both units
            # Speed in km/h = velocity (m/s) * 3.6
            speed_kmh = [v * 3.6 if v > 0 else None for v in velocity]
            data['speed_kmh'] = speed_kmh
            # Speed in mph = speed (km/h) * 0.621371
            data['speed_mph'] = [UnitConverter.speed_kmh_to_mph(s) if s else None for s in speed_kmh]
        
        # Add cadence if available
        cadence_data = get_stream_data('cadence')
        if cadence_data:
            data['cadence'] = cadence_data
        
        # Add power if available
        power_data = get_stream_data('watts')
        if power_data:
            data['power'] = power_data
        
        # Add altitude if available (in meters)
        altitude_data = get_stream_data('altitude')
        if altitude_data:
            data['altitude_m'] = altitude_data
            # Also calculate in feet for imperial units
            from units import UnitConverter
            data['altitude_ft'] = [UnitConverter.meters_to_feet(a) if a else None for a in altitude_data]
        
        # Add temperature if available
        temp_data = get_stream_data('temp')
        if temp_data:
            data['temperature'] = temp_data
        
        df = pd.DataFrame(data)
        
        # Create absolute timestamps
        df['timestamp'] = df['elapsed_time'].apply(
            lambda x: start_time + timedelta(seconds=x)
        )
        
        # Ensure timestamp is timezone-aware
        if df['timestamp'].dt.tz is None:
            df['timestamp'] = df['timestamp'].dt.tz_localize(tz)
        
        return df
    
    def get_spotify_tracks_for_activity(self, activity: Dict, 
                                       buffer_minutes: int = 5) -> List[Dict]:
        """
        Get Spotify tracks that were playing during the activity.
        Ensures timezone alignment between Strava activity and Spotify tracks.
        
        Args:
            activity: Activity details dictionary
            buffer_minutes: Minutes before/after activity to include
        
        Returns:
            List of track dictionaries with timing information
        """
        # Get activity start and end time with proper timezone handling
        start_time_str = activity.get('start_date')
        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        
        # Get activity timezone (Strava provides this)
        timezone_str = activity.get('timezone', 'UTC')
        try:
            activity_tz = pytz.timezone(timezone_str)
            # Convert UTC start time to activity timezone
            start_time = start_time.astimezone(activity_tz)
        except:
            activity_tz = pytz.UTC
            if start_time.tzinfo is None:
                start_time = pytz.UTC.localize(start_time)
        
        elapsed_time = activity.get('elapsed_time', 0)  # seconds
        end_time = start_time + timedelta(seconds=elapsed_time)
        
        # Add buffer
        search_start = start_time - timedelta(minutes=buffer_minutes)
        search_end = end_time + timedelta(minutes=buffer_minutes)
        
        # Try to get tracks from persistent storage first
        stored_tracks = self.track_storage.get_tracks_in_range(search_start, search_end)
        
        # Also fetch from API to keep storage up-to-date
        api_tracks = []
        try:
            api_tracks = self.spotify_client.get_recently_played(limit=50)
            # Store new tracks (deduplication happens automatically)
            if api_tracks:
                self.track_storage.store_tracks(api_tracks)
        except Exception as e:
            print(f"Warning: Could not fetch Spotify tracks from API: {e}")
        
        # Combine stored and API tracks, deduplicate by track_id + played_at
        all_tracks = {}
        for track in stored_tracks + api_tracks:
            key = (track['track_id'], track['played_at'])
            if key not in all_tracks:
                all_tracks[key] = track
        
        # Filter tracks that overlap with activity time
        # Convert all track timestamps to activity timezone for proper comparison
        relevant_tracks = []
        for track in all_tracks.values():
            track_time = track['played_at_timestamp']
            
            # Make track_time timezone-aware if needed (Spotify returns UTC)
            if track_time.tzinfo is None:
                track_time = pytz.UTC.localize(track_time)
            
            # Convert track time to activity timezone for proper comparison
            track_time_in_activity_tz = track_time.astimezone(activity_tz)
            track_end_in_activity_tz = track_time_in_activity_tz + timedelta(milliseconds=track['duration_ms'])
            
            # Check if track was playing during activity (all in same timezone now)
            if track_time_in_activity_tz <= search_end and track_end_in_activity_tz >= search_start:
                # Calculate overlap
                overlap_start = max(track_time_in_activity_tz, search_start)
                overlap_end = min(track_end_in_activity_tz, search_end)
                
                # Store times in activity timezone for consistency
                track['overlap_start'] = overlap_start
                track['overlap_end'] = overlap_end
                track['overlap_duration_seconds'] = (overlap_end - overlap_start).total_seconds()
                # Also store the track time in activity timezone for alignment
                track['played_at_timestamp_activity_tz'] = track_time_in_activity_tz
                
                relevant_tracks.append(track)
        
        # Sort by played_at time
        relevant_tracks.sort(key=lambda x: x.get('played_at_timestamp_activity_tz', x['played_at_timestamp']))
        
        return relevant_tracks
    
    def align_tracks_with_activity(self, activity_df: pd.DataFrame, 
                                   tracks: List[Dict]) -> pd.DataFrame:
        """
        Align Spotify tracks with activity timeline.
        
        Args:
            activity_df: DataFrame with activity metrics
            tracks: List of track dictionaries
        
        Returns:
            DataFrame with added track information columns
        """
        df = activity_df.copy()
        
        # Initialize track columns
        df['current_track'] = None
        df['track_name'] = None
        df['artists'] = None
        df['album'] = None
        
        # For each timestamp in activity, find which track was playing
        # Both timestamps should be in the same timezone (activity timezone)
        for idx, row in df.iterrows():
            timestamp = row['timestamp']  # Already in activity timezone
            
            # Find track that was playing at this timestamp
            for track in tracks:
                # Use activity timezone version if available, otherwise convert
                if 'played_at_timestamp_activity_tz' in track:
                    track_start = track['played_at_timestamp_activity_tz']
                else:
                    track_start = track['played_at_timestamp']
                    if track_start.tzinfo is None:
                        track_start = pytz.UTC.localize(track_start)
                    # Convert to activity timezone
                    activity_tz = timestamp.tzinfo if timestamp.tzinfo else pytz.UTC
                    track_start = track_start.astimezone(activity_tz)
                
                track_end = track_start + timedelta(milliseconds=track['duration_ms'])
                
                if track_start <= timestamp <= track_end:
                    df.at[idx, 'current_track'] = track['track_id']
                    df.at[idx, 'track_name'] = track['track_name']
                    df.at[idx, 'artists'] = ', '.join(track['artists'])
                    df.at[idx, 'album'] = track['album']
                    break
        
        return df
    
    def prepare_combined_data(self, activity_id: int, 
                             buffer_minutes: int = 5) -> pd.DataFrame:
        """
        Complete data preparation pipeline.
        
        Args:
            activity_id: Strava activity ID
            buffer_minutes: Minutes before/after activity to search for tracks
        
        Returns:
            Combined DataFrame with activity metrics and track information
        """
        # Get activity data
        activity, streams = self.get_activity_with_streams(activity_id)
        
        # Prepare activity DataFrame
        activity_df = self.prepare_activity_dataframe(activity, streams)
        
        # Get relevant Spotify tracks
        tracks = self.get_spotify_tracks_for_activity(activity, buffer_minutes)
        
        if not tracks:
            print("Warning: No Spotify tracks found for this activity period.")
            print("This could be due to:")
            print("1. Spotify API only provides last ~50 tracks")
            print("2. Activity occurred outside the available history window")
            print("3. No music was played during the activity")
        
        # Align tracks with activity timeline
        combined_df = self.align_tracks_with_activity(activity_df, tracks)
        
        return combined_df, activity, tracks
    
    def apply_smoothing(self, df: pd.DataFrame, 
                       smooth_heartrate: bool = False,
                       smooth_pace: bool = False,
                       smooth_cadence: bool = False,
                       smooth_power: bool = False,
                       smooth_altitude: bool = False,
                       window_size: int = 5) -> pd.DataFrame:
        """
        Apply smoothing to specified metrics using moving average.
        
        Args:
            df: DataFrame with activity metrics
            smooth_heartrate: Whether to smooth heart rate data
            smooth_pace: Whether to smooth pace data
            smooth_cadence: Whether to smooth cadence data
            smooth_power: Whether to smooth power data
            smooth_altitude: Whether to smooth altitude data
            window_size: Size of rolling window for moving average (default: 5)
        
        Returns:
            DataFrame with smoothed metrics (original columns preserved, smoothed versions added)
        """
        df = df.copy()
        
        # Helper function to apply rolling average smoothing
        def smooth_series(series, window=window_size):
            """Apply rolling average smoothing, handling NaN values and edge cases."""
            if series is None or len(series) == 0:
                return series
            
            # Convert to numeric, replacing any non-numeric values with NaN
            series_clean = pd.to_numeric(series, errors='coerce')
            
            # Use center=True for symmetric smoothing, min_periods=1 to handle edges
            # This ensures we get smoothed values even at the beginning/end of the series
            smoothed = series_clean.rolling(window=window, center=True, min_periods=1).mean()
            
            # Fill any remaining NaN values with original values (fallback)
            smoothed = smoothed.fillna(series_clean)
            
            return smoothed
        
        # Smooth heart rate
        if smooth_heartrate and 'heartrate' in df.columns:
            df['heartrate_smooth'] = smooth_series(df['heartrate'], window_size)
            # Replace original with smoothed, but keep original as backup
            df['heartrate_original'] = df['heartrate']
            df['heartrate'] = df['heartrate_smooth']
        
        # Smooth pace (both metric and imperial)
        if smooth_pace:
            if 'pace_min_per_km' in df.columns:
                df['pace_min_per_km_smooth'] = smooth_series(df['pace_min_per_km'], window_size)
                df['pace_min_per_km_original'] = df['pace_min_per_km']
                df['pace_min_per_km'] = df['pace_min_per_km_smooth']
            
            if 'pace_min_per_mile' in df.columns:
                df['pace_min_per_mile_smooth'] = smooth_series(df['pace_min_per_mile'], window_size)
                df['pace_min_per_mile_original'] = df['pace_min_per_mile']
                df['pace_min_per_mile'] = df['pace_min_per_mile_smooth']
        
        # Smooth cadence
        if smooth_cadence and 'cadence' in df.columns:
            df['cadence_smooth'] = smooth_series(df['cadence'], window_size)
            df['cadence_original'] = df['cadence']
            df['cadence'] = df['cadence_smooth']
        
        # Smooth power
        if smooth_power and 'power' in df.columns:
            df['power_smooth'] = smooth_series(df['power'], window_size)
            df['power_original'] = df['power']
            df['power'] = df['power_smooth']
        
        # Smooth altitude (both metric and imperial)
        if smooth_altitude:
            if 'altitude_m' in df.columns:
                df['altitude_m_smooth'] = smooth_series(df['altitude_m'], window_size)
                df['altitude_m_original'] = df['altitude_m']
                df['altitude_m'] = df['altitude_m_smooth']
            
            if 'altitude_ft' in df.columns:
                df['altitude_ft_smooth'] = smooth_series(df['altitude_ft'], window_size)
                df['altitude_ft_original'] = df['altitude_ft']
                df['altitude_ft'] = df['altitude_ft_smooth']
        
        return df
    
    def get_available_activities(self, days_back: int = 30) -> List[Dict]:
        """
        Get list of available activities within API history limits.
        
        Args:
            days_back: Number of days to look back
        
        Returns:
            List of activity summaries
        """
        after = datetime.now() - timedelta(days=days_back)
        activities = self.strava_client.get_activities(after=after)
        return activities

