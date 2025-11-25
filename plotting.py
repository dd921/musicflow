"""
Plotting module for creating interactive charts of workout metrics with Spotify tracks.
"""
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import Dict, List, Optional
import numpy as np


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
        
        # Create subplots
        fig = make_subplots(
            rows=num_subplots,
            cols=1,
            shared_xaxes=True,
            vertical_spacing=0.05,
            subplot_titles=self._get_subplot_titles(has_heartrate, has_pace, 
                                                   has_cadence, has_power, has_altitude),
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
        
        fig.update_layout(
            title=dict(
                text=f"{activity_name} - {activity_date}<br><sub>Overlaid with Spotify Tracks</sub>",
                x=0.5,
                xanchor='center'
            ),
            height=300 * num_subplots,
            showlegend=False,
            hovermode='x unified',
            template='plotly_white'
        )
        
        # Update x-axis label on last subplot
        fig.update_xaxes(title_text="Time (minutes)", row=num_subplots, col=1)
        
        return fig
    
    def _get_subplot_titles(self, has_heartrate: bool, has_pace: bool,
                           has_cadence: bool, has_power: bool, 
                           has_altitude: bool) -> List[str]:
        """Generate subplot titles based on available metrics."""
        titles = []
        if has_heartrate:
            titles.append("Heart Rate")
        if has_pace:
            titles.append("Pace")
        if has_cadence:
            titles.append("Cadence")
        if has_power:
            titles.append("Power")
        if has_altitude:
            titles.append("Altitude")
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
    
    def create_track_timeline(self, df: pd.DataFrame, tracks: List[Dict]) -> go.Figure:
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
                x=0.5, y=0.5, showarrow=False
            )
            return fig
        
        # Create timeline data
        timeline_data = []
        for track in tracks:
            start_min = (track['overlap_start'] - df['timestamp'].iloc[0]).total_seconds() / 60
            end_min = (track['overlap_end'] - df['timestamp'].iloc[0]).total_seconds() / 60
            
            timeline_data.append({
                'track': f"{track['track_name']} - {', '.join(track['artists'])}",
                'start': start_min,
                'end': end_min,
                'duration': end_min - start_min
            })
        
        # Create Gantt-like chart
        fig = go.Figure()
        
        for i, item in enumerate(timeline_data):
            fig.add_trace(go.Scatter(
                x=[item['start'], item['end']],
                y=[i, i],
                mode='lines+markers',
                name=item['track'],
                line=dict(width=20, color=f'hsl({(i * 137.5) % 360}, 70%, 50%)'),
                marker=dict(size=10),
                hovertemplate=f"<b>{item['track']}</b><br>" +
                             f"Start: {item['start']:.1f} min<br>" +
                             f"End: {item['end']:.1f} min<br>" +
                             f"Duration: {item['duration']:.1f} min<extra></extra>"
            ))
        
        fig.update_layout(
            title="Spotify Tracks Timeline",
            xaxis_title="Time (minutes)",
            yaxis_title="Track",
            height=200 + len(timeline_data) * 30,
            showlegend=False,
            hovermode='closest',
            template='plotly_white'
        )
        
        # Update y-axis to show track names
        fig.update_yaxes(
            tickmode='array',
            tickvals=list(range(len(timeline_data))),
            ticktext=[item['track'] for item in timeline_data]
        )
        
        return fig

