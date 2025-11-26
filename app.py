"""
Flask web application for MusicFlow - combining Strava and Spotify data.
"""
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from datetime import datetime, timedelta
import json
from strava_client import StravaClient
from spotify_client import SpotifyClient
from data_prep import DataPreparator
from plotting import WorkoutPlotter
from track_storage import TrackStorage
import config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Add Jinja2 filters for formatting
from formatting import format_distance, format_pace, format_elevation, format_datetime, format_date, format_time, calculate_pace_from_speed
from units import UnitConverter, TimezoneConverter
import pytz

@app.template_filter('format_distance')
def format_distance_filter(distance_m, units='metric'):
    """Jinja2 filter to format distance."""
    return format_distance(distance_m, units)

@app.template_filter('format_pace')
def format_pace_filter(pace_min_per_km, units='metric'):
    """Jinja2 filter to format pace."""
    return format_pace(pace_min_per_km, units)

@app.template_filter('format_elevation')
def format_elevation_filter(elevation_m, units='metric'):
    """Jinja2 filter to format elevation."""
    return format_elevation(elevation_m, units)

@app.template_filter('format_datetime_tz')
def format_datetime_tz_filter(dt_str, timezone='UTC'):
    """Jinja2 filter to format datetime with timezone."""
    try:
        if isinstance(dt_str, str):
            dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        else:
            dt = dt_str
        return format_datetime(dt, timezone)
    except:
        return str(dt_str)

@app.template_filter('format_date_tz')
def format_date_tz_filter(dt_str, timezone='UTC'):
    """Jinja2 filter to format date with timezone."""
    try:
        if isinstance(dt_str, str):
            dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        else:
            dt = dt_str
        return format_date(dt, timezone)
    except:
        return str(dt_str)[:10] if isinstance(dt_str, str) else str(dt_str)

@app.template_filter('format_time_tz')
def format_time_tz_filter(dt_str, timezone='UTC'):
    """Jinja2 filter to format time with timezone."""
    try:
        if isinstance(dt_str, str):
            dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        else:
            dt = dt_str
        return format_time(dt, timezone)
    except:
        return str(dt_str)[11:16] if isinstance(dt_str, str) and len(dt_str) > 16 else str(dt_str)

@app.template_filter('calculate_pace')
def calculate_pace_filter(speed_ms):
    """Jinja2 filter to calculate pace from speed."""
    return calculate_pace_from_speed(speed_ms)

# Initialize clients (will be set after authentication)
strava_client = None
spotify_client = None
data_prep = None
plotter = None
track_storage = TrackStorage()  # Initialize persistent storage


@app.route('/')
def index():
    """Home page."""
    strava_authenticated = 'strava_token' in session
    spotify_authenticated = 'spotify_token' in session
    
    return render_template('index.html',
                         strava_auth=strava_authenticated,
                         spotify_auth=spotify_authenticated)


@app.route('/debug/redirect-uris')
def debug_redirect_uris():
    """Debug endpoint to show configured redirect URIs."""
    return {
        'spotify_redirect_uri': config.SPOTIFY_REDIRECT_URI,
        'strava_redirect_uri': config.STRAVA_REDIRECT_URI
    }


@app.route('/strava/auth')
def strava_auth():
    """Redirect to Strava OAuth."""
    client = StravaClient()
    auth_url = client.get_authorization_url()
    return redirect(auth_url)


@app.route('/strava/callback')
def strava_callback():
    """Handle Strava OAuth callback."""
    code = request.args.get('code')
    error = request.args.get('error')
    
    if error:
        return f"Strava authentication error: {error}", 400
    
    if not code:
        return "No authorization code provided", 400
    
    try:
        client = StravaClient()
        token_data = client.exchange_code_for_token(code)
        
        # Store tokens in session
        session['strava_token'] = token_data['access_token']
        if 'refresh_token' in token_data:
            session['strava_refresh_token'] = token_data['refresh_token']
        
        # Initialize global client
        global strava_client, data_prep
        strava_client = StravaClient(access_token=session['strava_token'])
        
        if spotify_client:
            data_prep = DataPreparator(strava_client, spotify_client)
        
        return redirect(url_for('index'))
    except Exception as e:
        return f"Error authenticating with Strava: {str(e)}", 500


@app.route('/spotify/auth')
def spotify_auth():
    """Redirect to Spotify OAuth."""
    client = SpotifyClient()
    auth_url = client.get_authorization_url()
    # Debug: print redirect URI being used
    print(f"DEBUG: Using Spotify redirect URI: {config.SPOTIFY_REDIRECT_URI}")
    return redirect(auth_url)


@app.route('/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback."""
    code = request.args.get('code')
    error = request.args.get('error')
    
    if error:
        return f"Spotify authentication error: {error}", 400
    
    if not code:
        return "No authorization code provided", 400
    
    try:
        client = SpotifyClient()
        token_data = client.exchange_code_for_token(code)
        
        # Store tokens in session
        session['spotify_token'] = token_data['access_token']
        if 'refresh_token' in token_data:
            session['spotify_refresh_token'] = token_data['refresh_token']
        
        # Initialize global client
        global spotify_client, data_prep
        spotify_client = SpotifyClient(
            access_token=session['spotify_token'],
            refresh_token=session.get('spotify_refresh_token')
        )
        
        if strava_client:
            data_prep = DataPreparator(strava_client, spotify_client)
        
        return redirect(url_for('index'))
    except Exception as e:
        return f"Error authenticating with Spotify: {str(e)}", 500


@app.route('/activities')
def activities():
    """List available activities."""
    if 'strava_token' not in session:
        return redirect(url_for('strava_auth'))
    
    try:
        # Get unit and timezone preferences
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))
        
        # Store preferences in session
        session['units'] = units
        session['timezone'] = timezone
        
        # Initialize client if needed
        global strava_client
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        
        # Get activities from last 30 days
        activities_list = strava_client.get_activities(
            after=datetime.now() - timedelta(days=30)
        )
        
        # Sort activities newest to oldest
        activities_list = sorted(
            activities_list, 
            key=lambda x: x.get('start_date', ''), 
            reverse=True
        )
        
        # Get track counts for each activity if Spotify is connected
        activity_track_counts = {}
        if 'spotify_token' in session:
            try:
                global spotify_client, data_prep
                if not spotify_client:
                    spotify_client = SpotifyClient(
                        access_token=session['spotify_token'],
                        refresh_token=session.get('spotify_refresh_token')
                    )
                if not data_prep:
                    data_prep = DataPreparator(strava_client, spotify_client, track_storage)
                
                # Get track counts for each activity (with error handling)
                for activity in activities_list:
                    try:
                        tracks = data_prep.get_spotify_tracks_for_activity(activity, buffer_minutes=5)
                        activity_track_counts[activity['id']] = len(tracks)
                    except Exception as e:
                        # If we can't get tracks for an activity, set count to 0
                        activity_track_counts[activity['id']] = 0
            except Exception as e:
                # If data_prep fails, all activities get 0 tracks
                pass
        
        from units import TimezoneConverter
        
        return render_template('activities.html', 
                             activities=activities_list,
                             activity_track_counts=activity_track_counts,
                             units=units,
                             timezone=timezone,
                             available_timezones=TimezoneConverter.get_available_timezones())
    except Exception as e:
        return f"Error fetching activities: {str(e)}", 500


@app.route('/activity/<int:activity_id>')
def activity_detail(activity_id):
    """Show detailed activity with charts."""
    if 'strava_token' not in session:
        return redirect(url_for('strava_auth'))
    
    if 'spotify_token' not in session:
        return redirect(url_for('spotify_auth'))
    
    try:
        # Initialize clients if needed
        global strava_client, spotify_client, data_prep, plotter
        
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        if not data_prep:
            data_prep = DataPreparator(strava_client, spotify_client, track_storage)
        if not plotter:
            plotter = WorkoutPlotter()
        
        # Prepare data
        combined_df, activity, tracks = data_prep.prepare_combined_data(activity_id)
        
        # Validate activity is a dict
        if not isinstance(activity, dict):
            raise ValueError(f"Activity data is not in expected format. Got {type(activity)}")
        
        # Get unit and timezone preferences from request or session
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))
        
        # Store preferences in session
        session['units'] = units
        session['timezone'] = timezone
        
        # Create charts with preferences
        workout_chart = plotter.create_workout_chart(combined_df, activity, tracks, 
                                                    units=units, timezone=timezone)
        timeline_chart = plotter.create_track_timeline(combined_df, tracks, timezone=timezone)
        
        # Convert to JSON for rendering
        workout_chart_json = workout_chart.to_json()
        timeline_chart_json = timeline_chart.to_json()
        
        # Import timezone converter for display
        from units import TimezoneConverter
        
        return render_template('activity_detail.html',
                             activity=activity,
                             tracks=tracks,
                             workout_chart=workout_chart_json,
                             timeline_chart=timeline_chart_json,
                             num_tracks=len(tracks),
                             units=units,
                             timezone=timezone,
                             available_timezones=TimezoneConverter.get_available_timezones())
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return f"Error processing activity: {str(e)}\n\nDetails:\n{error_details}", 500


@app.route('/api/activity/<int:activity_id>/chart')
def api_activity_chart(activity_id):
    """API endpoint to regenerate chart with different units/timezone."""
    if 'strava_token' not in session or 'spotify_token' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))
        
        # Store preferences
        session['units'] = units
        session['timezone'] = timezone
        
        global strava_client, spotify_client, data_prep, plotter
        
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        if not data_prep:
            data_prep = DataPreparator(strava_client, spotify_client, track_storage)
        if not plotter:
            plotter = WorkoutPlotter()
        
        combined_df, activity, tracks = data_prep.prepare_combined_data(activity_id)
        
        # Create charts with new preferences
        workout_chart = plotter.create_workout_chart(combined_df, activity, tracks,
                                                    units=units, timezone=timezone)
        timeline_chart = plotter.create_track_timeline(combined_df, tracks, timezone=timezone)
        
        return jsonify({
            'workout_chart': workout_chart.to_json(),
            'timeline_chart': timeline_chart.to_json()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/activity/<int:activity_id>/data')
def api_activity_data(activity_id):
    """API endpoint to get activity data as JSON."""
    if 'strava_token' not in session or 'spotify_token' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        global strava_client, spotify_client, data_prep
        
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        if not data_prep:
            data_prep = DataPreparator(strava_client, spotify_client, track_storage)
        
        combined_df, activity, tracks = data_prep.prepare_combined_data(activity_id)
        
        # Convert DataFrame to JSON
        df_json = combined_df.to_json(orient='records', date_format='iso')
        
        return jsonify({
            'activity': activity,
            'tracks': tracks,
            'data': json.loads(df_json)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/spotify/debug')
def spotify_debug():
    """Debug page showing Spotify recently played tracks."""
    if 'spotify_token' not in session:
        return redirect(url_for('spotify_auth'))
    
    try:
        global spotify_client, track_storage
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        
        # Get all recently played tracks from API
        api_tracks = spotify_client.get_recently_played(limit=50)
        
        # Get storage stats
        stored_count = track_storage.get_track_count()
        oldest_track = track_storage.get_oldest_track()
        newest_track = track_storage.get_newest_track()
        
        return render_template('spotify_debug.html', 
                             tracks=api_tracks,
                             stored_count=stored_count,
                             oldest_track=oldest_track,
                             newest_track=newest_track)
    except Exception as e:
        return f"Error fetching Spotify tracks: {str(e)}", 500


@app.route('/spotify/sync', methods=['POST'])
def spotify_sync():
    """Sync Spotify tracks to persistent storage."""
    if 'spotify_token' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        global spotify_client, track_storage
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        
        # Sync tracks from Spotify API
        result = track_storage.sync_from_spotify(spotify_client)
        
        # Add a user-friendly message
        if 'error' in result:
            result['message'] = f"Error syncing: {result['error']}"
        elif result.get('stored', 0) > 0:
            result['message'] = f"✓ Synced {result['stored']} new tracks from Spotify ({result['fetched']} fetched, {result['skipped']} already stored). Total in database: {result['total_in_db']}"
        else:
            result['message'] = f"No new tracks to sync. All {result['fetched']} fetched tracks already stored. Total in database: {result['total_in_db']}"
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'message': f'Error: {str(e)}'}), 500


@app.route('/strava/refresh', methods=['POST'])
def strava_refresh():
    """Refresh Strava activities list."""
    if 'strava_token' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        global strava_client
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        
        # Get activities from last 30 days
        activities_list = strava_client.get_activities(
            after=datetime.now() - timedelta(days=30)
        )
        
        # Build response with activity details
        activity_summaries = []
        for activity in activities_list[:5]:  # Show first 5
            activity_summaries.append({
                'name': activity.get('name', 'Untitled'),
                'type': activity.get('type', 'Unknown'),
                'date': activity.get('start_date', '')[:10]
            })
        
        result = {
            'count': len(activities_list),
            'activities': activity_summaries,
            'message': f"✓ Refreshed {len(activities_list)} activities from the last 30 days"
        }
        
        if activities_list:
            latest = activities_list[0]
            result['latest'] = f"{latest.get('name', 'Untitled')} on {latest.get('start_date', '')[:10]}"
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'message': f'Error: {str(e)}'}), 500


@app.route('/spotify/storage')
def spotify_storage():
    """View stored Spotify tracks and storage statistics."""
    if 'spotify_token' not in session:
        return redirect(url_for('spotify_auth'))
    
    try:
        global track_storage
        
        # Get storage stats
        stored_count = track_storage.get_track_count()
        oldest_track = track_storage.get_oldest_track()
        newest_track = track_storage.get_newest_track()
        
        # Get all stored tracks (most recent first)
        all_stored_tracks = track_storage.get_all_tracks(limit=100)
        
        return render_template('spotify_storage.html',
                             stored_count=stored_count,
                             oldest_track=oldest_track,
                             newest_track=newest_track,
                             tracks=all_stored_tracks)
    except Exception as e:
        return f"Error accessing storage: {str(e)}", 500


@app.route('/activity/<int:activity_id>/debug')
def activity_debug(activity_id):
    """Debug page showing activity timing and Spotify track matching info."""
    if 'strava_token' not in session:
        return redirect(url_for('strava_auth'))
    
    if 'spotify_token' not in session:
        return redirect(url_for('spotify_auth'))
    
    try:
        global strava_client, spotify_client, data_prep
        
        if not strava_client:
            strava_client = StravaClient(access_token=session['strava_token'])
        if not spotify_client:
            spotify_client = SpotifyClient(
                access_token=session['spotify_token'],
                refresh_token=session.get('spotify_refresh_token')
            )
        if not data_prep:
            data_prep = DataPreparator(strava_client, spotify_client, track_storage)
        
        # Get activity
        activity, streams = data_prep.get_activity_with_streams(activity_id)
        
        # Get activity time range
        start_time_str = activity.get('start_date')
        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        elapsed_time = activity.get('elapsed_time', 0)
        end_time = start_time + timedelta(seconds=elapsed_time)
        
        # Get all Spotify tracks
        all_tracks = spotify_client.get_recently_played(limit=50)
        
        # Get tracks that should match
        matching_tracks = data_prep.get_spotify_tracks_for_activity(activity, buffer_minutes=5)
        
        # Calculate search window
        search_start = start_time - timedelta(minutes=5)
        search_end = end_time + timedelta(minutes=5)
        
        # Add track end times and matching status to all tracks
        for track in all_tracks:
            track['track_end'] = track['played_at_timestamp'] + timedelta(milliseconds=track['duration_ms'])
            track['is_matching'] = (track['played_at_timestamp'] <= search_end and 
                                   track['track_end'] >= search_start)
        
        return render_template('activity_debug.html',
                             activity=activity,
                             activity_start=start_time,
                             activity_end=end_time,
                             search_start=search_start,
                             search_end=search_end,
                             all_tracks=all_tracks,
                             matching_tracks=matching_tracks)
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return f"Error: {str(e)}\n\nDetails:\n{error_details}", 500


@app.route('/logout')
def logout():
    """Clear session and logout."""
    session.clear()
    global strava_client, spotify_client, data_prep, plotter
    strava_client = None
    spotify_client = None
    data_prep = None
    plotter = None
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5500)

