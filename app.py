"""
Flask web application for MusicFlow - combining Strava and Spotify data.
"""
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, g
from datetime import datetime, timedelta
from functools import wraps
import json
from strava_client import StravaClient
from spotify_client import SpotifyClient
from data_prep import DataPreparator
from plotting import WorkoutPlotter
from track_storage import TrackStorage
from token_manager import TokenManager
from user_manager import UserManager
from database import init_database
import config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY

# Initialize database on startup
init_database()

# Initialize managers
token_manager = TokenManager()
user_manager = UserManager()

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


def login_required(f):
    """Decorator to require login for a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


@app.before_request
def load_user_context():
    """Load user context and initialize clients before each request."""
    g.user = None
    g.strava_client = None
    g.spotify_client = None
    g.data_prep = None
    g.plotter = None
    g.track_storage = None

    if 'user_id' in session:
        user = user_manager.get_user_by_id(session['user_id'])
        if user:
            g.user = user

            # Initialize track storage with user_id
            g.track_storage = TrackStorage(user_id=user['id'])

            # Try to load Strava token and initialize client
            strava_token = token_manager.get_valid_token(user['id'], 'strava')
            if strava_token:
                g.strava_client = StravaClient(access_token=strava_token['access_token'])

            # Try to load Spotify token and initialize client
            spotify_token = token_manager.get_valid_token(user['id'], 'spotify')
            if spotify_token:
                g.spotify_client = SpotifyClient(
                    access_token=spotify_token['access_token'],
                    refresh_token=spotify_token.get('refresh_token')
                )

            # Initialize data preparator if both clients are available
            if g.strava_client and g.spotify_client:
                g.data_prep = DataPreparator(g.strava_client, g.spotify_client, g.track_storage)

            # Initialize plotter
            g.plotter = WorkoutPlotter()


@app.context_processor
def inject_user():
    """Make user available in all templates."""
    return {
        'current_user': g.user,
        'strava_auth': g.strava_client is not None,
        'spotify_auth': g.spotify_client is not None
    }


@app.route('/')
def index():
    """Home page."""
    if not g.user:
        return redirect(url_for('login'))

    strava_authenticated = g.strava_client is not None
    spotify_authenticated = g.spotify_client is not None

    return render_template('index.html',
                         strava_auth=strava_authenticated,
                         spotify_auth=spotify_authenticated)


@app.route('/login', methods=['GET', 'POST'])
def login():
    """Login page."""
    if g.user:
        return redirect(url_for('index'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        success, message, user = user_manager.authenticate(username, password)
        if success and user:
            session['user_id'] = user['id']
            session.permanent = True
            return redirect(url_for('index'))
        else:
            error = message

    return render_template('login.html', error=error)


@app.route('/register', methods=['GET', 'POST'])
def register():
    """Registration page."""
    if g.user:
        return redirect(url_for('index'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')

        if password != confirm_password:
            error = "Passwords do not match"
        else:
            success, message, user_id = user_manager.create_user(username, password)
            if success and user_id:
                session['user_id'] = user_id
                session.permanent = True
                return redirect(url_for('index'))
            else:
                error = message

    return render_template('login.html', error=error, is_register=True)


@app.route('/debug/redirect-uris')
def debug_redirect_uris():
    """Debug endpoint to show configured redirect URIs."""
    return {
        'spotify_redirect_uri': config.SPOTIFY_REDIRECT_URI,
        'strava_redirect_uri': config.STRAVA_REDIRECT_URI,
        'base_url': config.BASE_URL
    }


@app.route('/strava/auth')
@login_required
def strava_auth():
    """Redirect to Strava OAuth."""
    client = StravaClient()
    auth_url = client.get_authorization_url()
    return redirect(auth_url)


@app.route('/strava/callback')
def strava_callback():
    """Handle Strava OAuth callback."""
    if 'user_id' not in session:
        return redirect(url_for('login'))

    code = request.args.get('code')
    error = request.args.get('error')

    if error:
        return f"Strava authentication error: {error}", 400

    if not code:
        return "No authorization code provided", 400

    try:
        client = StravaClient()
        token_data = client.exchange_code_for_token(code)

        # Store token in database
        token_manager.store_token(session['user_id'], 'strava', token_data)

        return redirect(url_for('index'))
    except Exception as e:
        return f"Error authenticating with Strava: {str(e)}", 500


@app.route('/spotify/auth')
@login_required
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
    if 'user_id' not in session:
        return redirect(url_for('login'))

    code = request.args.get('code')
    error = request.args.get('error')

    if error:
        return f"Spotify authentication error: {error}", 400

    if not code:
        return "No authorization code provided", 400

    try:
        client = SpotifyClient()
        token_data = client.exchange_code_for_token(code)

        # Store token in database
        token_manager.store_token(session['user_id'], 'spotify', token_data)

        return redirect(url_for('index'))
    except Exception as e:
        return f"Error authenticating with Spotify: {str(e)}", 500


@app.route('/activities')
@login_required
def activities():
    """List available activities."""
    if not g.strava_client:
        return redirect(url_for('strava_auth'))

    try:
        # Get unit and timezone preferences
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))

        # Store preferences in session
        session['units'] = units
        session['timezone'] = timezone

        # Get activities from last 30 days
        activities_list = g.strava_client.get_activities(
            after=datetime.now() - timedelta(days=30)
        )

        # Sort activities newest to oldest
        activities_list = sorted(
            activities_list,
            key=lambda x: x.get('start_date', ''),
            reverse=True
        )

        # Get track counts for each activity if Spotify is connected
        # Optimized: Use a single batch query instead of per-activity queries
        activity_track_counts = {}
        if g.spotify_client and activities_list and g.track_storage:
            try:
                # Get all activity time ranges
                activity_ranges = []
                for activity in activities_list:
                    try:
                        start_time_str = activity.get('start_date')
                        if not start_time_str:
                            continue
                        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                        elapsed_time = activity.get('elapsed_time', 0)
                        end_time = start_time + timedelta(seconds=elapsed_time)

                        # Get activity timezone
                        timezone_str = activity.get('timezone', 'UTC')
                        try:
                            activity_tz = pytz.timezone(timezone_str)
                        except:
                            activity_tz = pytz.UTC

                        start_time_local = start_time.astimezone(activity_tz)
                        end_time_local = end_time.astimezone(activity_tz)

                        # Add buffer
                        search_start = start_time_local - timedelta(minutes=5)
                        search_end = end_time_local + timedelta(minutes=5)

                        activity_ranges.append({
                            'id': activity['id'],
                            'start': search_start,
                            'end': search_end
                        })
                    except Exception:
                        continue

                # Batch query: get all tracks that might match any activity
                if activity_ranges:
                    # Get earliest start and latest end
                    all_starts = [r['start'] for r in activity_ranges]
                    all_ends = [r['end'] for r in activity_ranges]
                    overall_start = min(all_starts)
                    overall_end = max(all_ends)

                    # Get all tracks in the overall time range (single DB query)
                    all_tracks = g.track_storage.get_tracks_in_range(overall_start, overall_end)

                    # Pre-process tracks: convert to dict keyed by track_id for faster lookup
                    # Count tracks for each activity (optimized overlap check)
                    for activity_range in activity_ranges:
                        count = 0
                        for track in all_tracks:
                            track_start = track['played_at_timestamp']
                            if track_start.tzinfo is None:
                                track_start = pytz.UTC.localize(track_start)

                            # Convert to activity timezone once
                            track_start_local = track_start.astimezone(activity_range['start'].tzinfo)
                            track_end_local = track_start_local + timedelta(milliseconds=track.get('duration_ms', 0))

                            # Simple overlap check
                            if track_start_local < activity_range['end'] and track_end_local > activity_range['start']:
                                count += 1

                        activity_track_counts[activity_range['id']] = count
            except Exception as e:
                # If anything fails, all activities get 0 tracks
                print(f"Error getting track counts: {e}")
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
@login_required
def activity_detail(activity_id):
    """Show detailed activity with charts."""
    if not g.strava_client:
        return redirect(url_for('strava_auth'))

    if not g.spotify_client:
        return redirect(url_for('spotify_auth'))

    try:
        # Get unit and timezone preferences from request or session
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))

        # Get smoothing preferences from request or session
        # Helper function to safely convert to boolean
        def to_bool(value, default=False):
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() == 'true'
            return default

        smooth_heartrate = to_bool(request.args.get('smooth_hr', session.get('smooth_hr', False)))
        smooth_pace = to_bool(request.args.get('smooth_pace', session.get('smooth_pace', False)))
        smooth_cadence = to_bool(request.args.get('smooth_cadence', session.get('smooth_cadence', False)))
        smooth_power = to_bool(request.args.get('smooth_power', session.get('smooth_power', False)))
        smooth_altitude = to_bool(request.args.get('smooth_altitude', session.get('smooth_altitude', False)))

        # Get window size, handling both string and int
        smooth_window_val = request.args.get('smooth_window', session.get('smooth_window', 5))
        smooth_window = int(smooth_window_val) if smooth_window_val else 5

        # Store preferences in session
        session['units'] = units
        session['timezone'] = timezone
        session['smooth_hr'] = smooth_heartrate
        session['smooth_pace'] = smooth_pace
        session['smooth_cadence'] = smooth_cadence
        session['smooth_power'] = smooth_power
        session['smooth_altitude'] = smooth_altitude
        session['smooth_window'] = smooth_window

        # Prepare data
        combined_df, activity, tracks = g.data_prep.prepare_combined_data(activity_id)

        # Validate activity is a dict
        if not isinstance(activity, dict):
            raise ValueError(f"Activity data is not in expected format. Got {type(activity)}")

        # Apply smoothing if any metric is enabled
        if any([smooth_heartrate, smooth_pace, smooth_cadence, smooth_power, smooth_altitude]):
            combined_df = g.data_prep.apply_smoothing(
                combined_df,
                smooth_heartrate=smooth_heartrate,
                smooth_pace=smooth_pace,
                smooth_cadence=smooth_cadence,
                smooth_power=smooth_power,
                smooth_altitude=smooth_altitude,
                window_size=smooth_window
            )

        # Create charts with preferences
        workout_chart = g.plotter.create_workout_chart(combined_df, activity, tracks,
                                                    units=units, timezone=timezone)
        timeline_chart = g.plotter.create_track_timeline(combined_df, tracks, timezone=timezone)

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
                             smooth_heartrate=smooth_heartrate,
                             smooth_pace=smooth_pace,
                             smooth_cadence=smooth_cadence,
                             smooth_power=smooth_power,
                             smooth_altitude=smooth_altitude,
                             smooth_window=smooth_window,
                             available_timezones=TimezoneConverter.get_available_timezones())
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return f"Error processing activity: {str(e)}\n\nDetails:\n{error_details}", 500


@app.route('/api/activity/<int:activity_id>/chart')
@login_required
def api_activity_chart(activity_id):
    """API endpoint to regenerate chart with different units/timezone/smoothing."""
    if not g.strava_client or not g.spotify_client:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        units = request.args.get('units', session.get('units', 'metric'))
        timezone = request.args.get('timezone', session.get('timezone', 'UTC'))

        # Helper function to safely convert to boolean
        def to_bool(value, default=False):
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() == 'true'
            return default

        # Get smoothing preferences
        smooth_heartrate = to_bool(request.args.get('smooth_hr', session.get('smooth_hr', False)))
        smooth_pace = to_bool(request.args.get('smooth_pace', session.get('smooth_pace', False)))
        smooth_cadence = to_bool(request.args.get('smooth_cadence', session.get('smooth_cadence', False)))
        smooth_power = to_bool(request.args.get('smooth_power', session.get('smooth_power', False)))
        smooth_altitude = to_bool(request.args.get('smooth_altitude', session.get('smooth_altitude', False)))

        # Get window size, handling both string and int
        smooth_window_val = request.args.get('smooth_window', session.get('smooth_window', 5))
        smooth_window = int(smooth_window_val) if smooth_window_val else 5

        # Store preferences
        session['units'] = units
        session['timezone'] = timezone
        session['smooth_hr'] = smooth_heartrate
        session['smooth_pace'] = smooth_pace
        session['smooth_cadence'] = smooth_cadence
        session['smooth_power'] = smooth_power
        session['smooth_altitude'] = smooth_altitude
        session['smooth_window'] = smooth_window

        combined_df, activity, tracks = g.data_prep.prepare_combined_data(activity_id)

        # Apply smoothing if any metric is enabled
        if any([smooth_heartrate, smooth_pace, smooth_cadence, smooth_power, smooth_altitude]):
            combined_df = g.data_prep.apply_smoothing(
                combined_df,
                smooth_heartrate=smooth_heartrate,
                smooth_pace=smooth_pace,
                smooth_cadence=smooth_cadence,
                smooth_power=smooth_power,
                smooth_altitude=smooth_altitude,
                window_size=smooth_window
            )

        # Create charts with new preferences
        workout_chart = g.plotter.create_workout_chart(combined_df, activity, tracks,
                                                    units=units, timezone=timezone)
        timeline_chart = g.plotter.create_track_timeline(combined_df, tracks, timezone=timezone)

        return jsonify({
            'workout_chart': workout_chart.to_json(),
            'timeline_chart': timeline_chart.to_json()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/activity/<int:activity_id>/data')
@login_required
def api_activity_data(activity_id):
    """API endpoint to get activity data as JSON."""
    if not g.strava_client or not g.spotify_client:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        combined_df, activity, tracks = g.data_prep.prepare_combined_data(activity_id)

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
@login_required
def spotify_debug():
    """Debug page showing Spotify recently played tracks."""
    if not g.spotify_client:
        return redirect(url_for('spotify_auth'))

    try:
        # Get all recently played tracks from API
        api_tracks = g.spotify_client.get_recently_played(limit=50)

        # Get storage stats
        stored_count = g.track_storage.get_track_count() if g.track_storage else 0
        oldest_track = g.track_storage.get_oldest_track() if g.track_storage else None
        newest_track = g.track_storage.get_newest_track() if g.track_storage else None

        return render_template('spotify_debug.html',
                             tracks=api_tracks,
                             stored_count=stored_count,
                             oldest_track=oldest_track,
                             newest_track=newest_track)
    except Exception as e:
        return f"Error fetching Spotify tracks: {str(e)}", 500


@app.route('/spotify/sync', methods=['POST'])
@login_required
def spotify_sync():
    """Sync Spotify tracks to persistent storage."""
    if not g.spotify_client:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        if not g.track_storage:
            g.track_storage = TrackStorage(user_id=g.user['id'])

        # Sync tracks from Spotify API
        result = g.track_storage.sync_from_spotify(g.spotify_client)

        # Add a user-friendly message
        if 'error' in result:
            result['message'] = f"Error syncing: {result['error']}"
        elif result.get('stored', 0) > 0:
            result['message'] = f"Synced {result['stored']} new tracks from Spotify ({result['fetched']} fetched, {result['skipped']} already stored). Total in database: {result['total_in_db']}"
        else:
            result['message'] = f"No new tracks to sync. All {result['fetched']} fetched tracks already stored. Total in database: {result['total_in_db']}"

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'message': f'Error: {str(e)}'}), 500


@app.route('/strava/refresh', methods=['POST'])
@login_required
def strava_refresh():
    """Refresh Strava activities list."""
    if not g.strava_client:
        return jsonify({'error': 'Not authenticated'}), 401

    try:
        # Get activities from last 30 days
        activities_list = g.strava_client.get_activities(
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
            'message': f"Refreshed {len(activities_list)} activities from the last 30 days"
        }

        if activities_list:
            latest = activities_list[0]
            result['latest'] = f"{latest.get('name', 'Untitled')} on {latest.get('start_date', '')[:10]}"

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'message': f'Error: {str(e)}'}), 500


@app.route('/spotify/storage')
@login_required
def spotify_storage():
    """View stored Spotify tracks and storage statistics."""
    if not g.spotify_client:
        return redirect(url_for('spotify_auth'))

    try:
        if not g.track_storage:
            g.track_storage = TrackStorage(user_id=g.user['id'])

        # Get storage stats
        stored_count = g.track_storage.get_track_count()
        oldest_track = g.track_storage.get_oldest_track()
        newest_track = g.track_storage.get_newest_track()

        # Get all stored tracks (most recent first)
        all_stored_tracks = g.track_storage.get_all_tracks(limit=100)

        return render_template('spotify_storage.html',
                             stored_count=stored_count,
                             oldest_track=oldest_track,
                             newest_track=newest_track,
                             tracks=all_stored_tracks)
    except Exception as e:
        return f"Error accessing storage: {str(e)}", 500


@app.route('/activity/<int:activity_id>/debug')
@login_required
def activity_debug(activity_id):
    """Debug page showing activity timing and Spotify track matching info."""
    if not g.strava_client:
        return redirect(url_for('strava_auth'))

    if not g.spotify_client:
        return redirect(url_for('spotify_auth'))

    try:
        # Get activity
        activity, streams = g.data_prep.get_activity_with_streams(activity_id)

        # Get activity time range
        start_time_str = activity.get('start_date')
        start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
        elapsed_time = activity.get('elapsed_time', 0)
        end_time = start_time + timedelta(seconds=elapsed_time)

        # Get all Spotify tracks
        all_tracks = g.spotify_client.get_recently_played(limit=50)

        # Get tracks that should match
        matching_tracks = g.data_prep.get_spotify_tracks_for_activity(activity, buffer_minutes=5)

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
    return redirect(url_for('login'))


@app.route('/strava/disconnect', methods=['POST'])
@login_required
def strava_disconnect():
    """Disconnect Strava account."""
    token_manager.delete_token(g.user['id'], 'strava')
    return redirect(url_for('index'))


@app.route('/spotify/disconnect', methods=['POST'])
@login_required
def spotify_disconnect():
    """Disconnect Spotify account."""
    token_manager.delete_token(g.user['id'], 'spotify')
    return redirect(url_for('index'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5500)
