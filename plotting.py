"""
Plotting module for creating interactive charts of workout metrics with Spotify tracks.
"""
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, List, Optional
from datetime import timedelta
import numpy as np
import pytz


class WorkoutPlotter:
    """Creates interactive plots of workout data with Spotify track overlays."""
    
    def __init__(self):
        """Initialize plotter."""
        pass
    
    def create_workout_chart(self, df: pd.DataFrame, activity: Dict, 
                            tracks: List[Dict], 
                            units: str = 'metric',
                            timezone: str = 'UTC') -> go.Figure:
        """
        Create comprehensive workout chart with Spotify track overlays.
        
        Args:
            df: Combined DataFrame with activity metrics and track info
            activity: Activity details dictionary
            tracks: List of track dictionaries
        
        Returns:
            Plotly Figure object
        """
        # Import unit converter
        from units import UnitConverter, TimezoneConverter
        
        # Determine which metrics are available
        # Convert to Python bool to avoid numpy.bool_ issues with Plotly
        has_heartrate = bool('heartrate' in df.columns and df['heartrate'].notna().any())
        has_pace_km = bool('pace_min_per_km' in df.columns and df['pace_min_per_km'].notna().any())
        has_pace_mile = bool('pace_min_per_mile' in df.columns and df['pace_min_per_mile'].notna().any())
        has_pace = has_pace_km or has_pace_mile
        has_cadence = bool('cadence' in df.columns and df['cadence'].notna().any())
        has_power = bool('power' in df.columns and df['power'].notna().any())
        has_altitude_m = bool('altitude_m' in df.columns and df['altitude_m'].notna().any())
        has_altitude_ft = bool('altitude_ft' in df.columns and df['altitude_ft'].notna().any())
        has_altitude = has_altitude_m or has_altitude_ft
        has_tracks = bool(df['track_name'].notna().any())
        
        # Determine which unit columns to use
        use_imperial = (units == 'imperial')
        
        # Count subplots needed
        num_subplots = int(sum([has_heartrate, has_pace, has_cadence, has_power, has_altitude]))
        if num_subplots == 0:
            raise ValueError("No metric data available to plot")
        
        # Calculate vertical spacing - more space for fewer subplots
        if num_subplots <= 2:
            v_spacing = 0.15
        elif num_subplots <= 3:
            v_spacing = 0.12
        else:
            v_spacing = 0.08
        
        # Create subplots with proper spacing
        fig = make_subplots(
            rows=num_subplots,
            cols=1,
            shared_xaxes=True,
            vertical_spacing=v_spacing,
            subplot_titles=self._get_subplot_titles(has_heartrate, has_pace, 
                                                   has_cadence, has_power, has_altitude, use_imperial),
            row_heights=[1] * num_subplots
        )
        
        # Convert timestamps to selected timezone if needed
        if timezone != 'UTC':
            df = df.copy()
            df['timestamp'] = df['timestamp'].apply(
                lambda x: TimezoneConverter.convert_datetime(x, timezone) if pd.notna(x) else x
            )
        
        # Convert elapsed time to minutes for x-axis
        x_data = df['elapsed_time'] / 60  # minutes
        
        row = 1
        
        # Heart Rate
        if has_heartrate:
            fig.add_trace(
                go.Scatter(
                    x=x_data,
                    y=df['heartrate'],
                    mode='lines',
                    name='Heart Rate',
                    line=dict(color='#e74c3c', width=2),
                    hovertemplate='<b>Heart Rate</b><br>' +
                                  'Time: %{x:.1f} min<br>' +
                                  'HR: %{y:.0f} bpm<extra></extra>'
                ),
                row=row, col=1
            )
            fig.update_yaxes(title_text="Heart Rate (bpm)", row=row, col=1)
            row += 1
        
        # Pace
        if has_pace:
            # Create color-coded pace based on tracks
            colors = self._get_track_colors(df, len(x_data))
            
            # Select pace column based on units
            if use_imperial and has_pace_mile:
                pace_data = df['pace_min_per_mile']
                pace_unit = 'min/mile'
            else:
                pace_data = df['pace_min_per_km']
                pace_unit = 'min/km'
            
            fig.add_trace(
                go.Scatter(
                    x=x_data,
                    y=pace_data,
                    mode='lines+markers',
                    name='Pace',
                    line=dict(color='#3498db', width=2),
                    marker=dict(size=4, color=colors, showscale=has_tracks,
                               colorscale='Viridis', cmin=0, cmax=len(tracks) if tracks else 1),
                    hovertemplate='<b>Pace</b><br>' +
                                  'Time: %{x:.1f} min<br>' +
                                  f'Pace: %{{y:.2f}} {pace_unit}<br>' +
                                  '%{customdata}<extra></extra>',
                    customdata=df.apply(
                        lambda r: f"Track: {r['track_name']}<br>Artists: {r['artists']}" 
                        if pd.notna(r['track_name']) else "No track",
                        axis=1
                    )
                ),
                row=row, col=1
            )
            fig.update_yaxes(title_text=f"Pace ({pace_unit})", row=row, col=1)
            # Invert y-axis for pace (faster = lower)
            fig.update_yaxes(autorange="reversed", row=row, col=1)
            row += 1
        
        # Cadence
        if has_cadence:
            fig.add_trace(
                go.Scatter(
                    x=x_data,
                    y=df['cadence'],
                    mode='lines',
                    name='Cadence',
                    line=dict(color='#2ecc71', width=2),
                    hovertemplate='<b>Cadence</b><br>' +
                                  'Time: %{x:.1f} min<br>' +
                                  'Cadence: %{y:.0f} rpm<extra></extra>'
                ),
                row=row, col=1
            )
            fig.update_yaxes(title_text="Cadence (rpm)", row=row, col=1)
            row += 1
        
        # Power
        if has_power:
            fig.add_trace(
                go.Scatter(
                    x=x_data,
                    y=df['power'],
                    mode='lines',
                    name='Power',
                    line=dict(color='#f39c12', width=2),
                    hovertemplate='<b>Power</b><br>' +
                                  'Time: %{x:.1f} min<br>' +
                                  'Power: %{y:.0f} W<extra></extra>'
                ),
                row=row, col=1
            )
            fig.update_yaxes(title_text="Power (W)", row=row, col=1)
            row += 1
        
        # Altitude
        if has_altitude:
            # Select altitude column based on units
            if use_imperial and has_altitude_ft:
                altitude_data = df['altitude_ft']
                altitude_unit = 'ft'
            else:
                altitude_data = df['altitude_m']
                altitude_unit = 'm'
            
            fig.add_trace(
                go.Scatter(
                    x=x_data,
                    y=altitude_data,
                    mode='lines',
                    name='Altitude',
                    line=dict(color='#9b59b6', width=2),
                    fill='tozeroy',
                    hovertemplate='<b>Altitude</b><br>' +
                                  'Time: %{x:.1f} min<br>' +
                                  f'Altitude: %{{y:.0f}} {altitude_unit}<extra></extra>'
                ),
                row=row, col=1
            )
            fig.update_yaxes(title_text=f"Altitude ({altitude_unit})", row=row, col=1)
        
        # Add track change markers
        if has_tracks:
            self._add_track_markers(fig, df, x_data, num_subplots)
        
        # Update layout
        activity_name = activity.get('name', 'Workout')
        activity_date = activity.get('start_date', '')[:10]
        
        # Calculate height based on number of subplots (more space per subplot)
        height_per_subplot = 250
        total_height = height_per_subplot * num_subplots + 100  # Extra for title and margins
        
        fig.update_layout(
            title=dict(
                text=f"{activity_name} - {activity_date}",
                x=0.5,
                xanchor='center',
                font=dict(size=18)
            ),
            height=total_height,
            showlegend=False,
            hovermode='x unified',
            template='plotly_white',
            margin=dict(t=80, b=60, l=80, r=40)
        )
        
        # Update all x-axes
        for i in range(1, num_subplots + 1):
            fig.update_xaxes(
                showgrid=True,
                gridcolor='rgba(128, 128, 128, 0.2)',
                row=i, col=1
            )
            fig.update_yaxes(
                showgrid=True,
                gridcolor='rgba(128, 128, 128, 0.2)',
                row=i, col=1
            )
        
        # Update x-axis label on last subplot only
        fig.update_xaxes(title_text="Time (minutes)", row=num_subplots, col=1)
        
        return fig
    
    def _get_subplot_titles(self, has_heartrate: bool, has_pace: bool,
                           has_cadence: bool, has_power: bool, 
                           has_altitude: bool, use_imperial: bool = False) -> List[str]:
        """Generate subplot titles based on available metrics."""
        titles = []
        if has_heartrate:
            titles.append("Heart Rate (bpm)")
        if has_pace:
            pace_unit = "min/mile" if use_imperial else "min/km"
            titles.append(f"Pace ({pace_unit})")
        if has_cadence:
            titles.append("Cadence (rpm)")
        if has_power:
            titles.append("Power (W)")
        if has_altitude:
            altitude_unit = "ft" if use_imperial else "m"
            titles.append(f"Altitude ({altitude_unit})")
        return titles
    
    def _get_track_colors(self, df: pd.DataFrame, length: int) -> List[float]:
        """Generate color values for each data point based on track."""
        colors = []
        track_ids = {}
        track_counter = 0
        
        for idx, row in df.iterrows():
            if pd.notna(row['current_track']):
                track_id = row['current_track']
                if track_id not in track_ids:
                    track_ids[track_id] = track_counter
                    track_counter += 1
                colors.append(track_ids[track_id])
            else:
                colors.append(-1)
        
        return colors
    
    def _add_track_markers(self, fig: go.Figure, df: pd.DataFrame, 
                          x_data: pd.Series, num_subplots: int):
        """Add vertical markers for track changes."""
        # Find track change points
        track_changes = []
        prev_track = None
        
        for idx, elapsed_min in enumerate(x_data):
            current_track = df.iloc[idx]['current_track']
            if current_track != prev_track and pd.notna(current_track):
                track_name = df.iloc[idx]['track_name']
                artists = df.iloc[idx]['artists']
                track_changes.append({
                    'x': elapsed_min,
                    'track': track_name,
                    'artists': artists
                })
            prev_track = current_track
        
        # Add vertical lines for track changes
        for change in track_changes:
            fig.add_vline(
                x=change['x'],
                line_dash="dash",
                line_color="gray",
                opacity=0.5,
                annotation_text=change['track'][:20] + "..." if len(change['track']) > 20 else change['track'],
                annotation_position="top",
                row="all"
            )
    
    def create_track_timeline(self, df: pd.DataFrame, tracks: List[Dict], 
                             timezone: str = 'UTC') -> go.Figure:
        """
        Create a timeline visualization showing which tracks were playing when.
        
        Args:
            df: Combined DataFrame
            tracks: List of track dictionaries
        
        Returns:
            Plotly Figure object
        """
        if not tracks:
            fig = go.Figure()
            fig.add_annotation(
                text="No tracks available for this activity",
                xref="paper", yref="paper",
                x=0.5, y=0.5, showarrow=False,
                font=dict(size=16, color='#A0A0A0')
            )
            fig.update_layout(
                height=200,
                template='plotly_white'
            )
            return fig
        
        # Import timezone converter
        from units import TimezoneConverter
        import pytz
        
        # Get reference time (activity start)
        reference_time = df['timestamp'].iloc[0]
        
        # Ensure reference_time is timezone-aware
        if reference_time.tzinfo is None:
            reference_time = pytz.UTC.localize(reference_time)
        
        # Create timeline data
        timeline_data = []
        for track in tracks:
            try:
                # Use activity timezone version if available
                if 'overlap_start' in track and 'overlap_end' in track and track['overlap_start'] is not None:
                    overlap_start = track['overlap_start']
                    overlap_end = track['overlap_end']
                    
                    # Ensure timezone-aware
                    if hasattr(overlap_start, 'tzinfo') and overlap_start.tzinfo is None:
                        overlap_start = pytz.UTC.localize(overlap_start)
                    if hasattr(overlap_end, 'tzinfo') and overlap_end.tzinfo is None:
                        overlap_end = pytz.UTC.localize(overlap_end)
                    
                    start_min = (overlap_start - reference_time).total_seconds() / 60
                    end_min = (overlap_end - reference_time).total_seconds() / 60
                else:
                    # Fallback to played_at_timestamp
                    track_start = track.get('played_at_timestamp_activity_tz', track.get('played_at_timestamp'))
                    if track_start is None:
                        continue
                    
                    # Ensure timezone-aware
                    if hasattr(track_start, 'tzinfo') and track_start.tzinfo is None:
                        track_start = pytz.UTC.localize(track_start)
                    
                    track_end = track_start + timedelta(milliseconds=track.get('duration_ms', 0))
                    
                    start_min = (track_start - reference_time).total_seconds() / 60
                    end_min = (track_end - reference_time).total_seconds() / 60
                
                # Truncate track name for display
                track_name = track.get('track_name', 'Unknown')[:40]
                artists = ', '.join(track.get('artists', ['Unknown']))[:30]
                display_name = f"{track_name}"
                full_name = f"{track.get('track_name', 'Unknown')} - {', '.join(track.get('artists', ['Unknown']))}"
                
                timeline_data.append({
                    'track': display_name,
                    'full_name': full_name,
                    'artists': artists,
                    'start': float(start_min),
                    'end': float(end_min),
                    'duration': float(end_min - start_min)
                })
            except Exception as e:
                print(f"Error processing track for timeline: {e}")
                continue
        
        if not timeline_data:
            fig = go.Figure()
            fig.add_annotation(
                text="Could not process track timeline data",
                xref="paper", yref="paper",
                x=0.5, y=0.5, showarrow=False,
                font=dict(size=16, color='#A0A0A0')
            )
            fig.update_layout(height=200, template='plotly_white')
            return fig
        
        # Create horizontal bar chart for timeline
        fig = go.Figure()
        
        colors = ['#FF6B35', '#1DB954', '#FF3366', '#667eea', '#f39c12', 
                  '#2ecc71', '#e74c3c', '#9b59b6', '#3498db', '#1abc9c']
        
        for i, item in enumerate(timeline_data):
            color = colors[i % len(colors)]
            
            # Create a bar using shapes for better control
            fig.add_trace(go.Bar(
                y=[item['track']],
                x=[item['duration']],
                base=[item['start']],
                orientation='h',
                name=item['track'],
                marker=dict(color=color, line=dict(width=0)),
                hovertemplate=(
                    f"<b>{item['full_name']}</b><br>" +
                    f"Start: {item['start']:.1f} min<br>" +
                    f"End: {item['end']:.1f} min<br>" +
                    f"Duration: {item['duration']:.1f} min<extra></extra>"
                ),
                showlegend=False
            ))
        
        # Calculate height based on number of tracks
        bar_height = 40
        chart_height = max(200, len(timeline_data) * bar_height + 100)
        
        fig.update_layout(
            title=dict(
                text="🎵 Track Timeline",
                font=dict(size=16)
            ),
            xaxis_title="Time (minutes)",
            height=chart_height,
            showlegend=False,
            hovermode='closest',
            template='plotly_white',
            barmode='overlay',
            margin=dict(l=200, r=40, t=60, b=60),
            yaxis=dict(
                autorange='reversed',  # Show first track at top
                tickfont=dict(size=11)
            ),
            xaxis=dict(
                showgrid=True,
                gridcolor='rgba(128, 128, 128, 0.2)'
            )
        )
        
        return fig

